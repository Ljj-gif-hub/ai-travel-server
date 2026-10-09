package org.example.traveljava;

import org.example.traveljava.entity.Order;
import org.example.traveljava.mq.TravelEventPublisher;
import org.example.traveljava.repository.OrderRepository;
import org.example.traveljava.service.*;
import org.example.traveljava.service.payment.PaymentProvider;
import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentSafetyTests {
    @Test
    void missingInvalidOrMismatchedAmountNeverMarksPaid() {
        PaymentProvider provider = mock(PaymentProvider.class);
        OrderService orderService = mock(OrderService.class);
        OrderRepository orders = mock(OrderRepository.class);
        when(provider.getProviderName()).thenReturn("alipay");
        when(provider.verifyNotify(any())).thenReturn(true);
        Order order = new Order(); order.setId(1L); order.setPrice(100L);
        when(orders.findByOrderNoForUpdate("test-order")).thenReturn(Optional.of(order));
        PaymentService service = new PaymentService(provider, orderService, orders);
        for (String amount : new String[]{null, "", "bad", "1.5", "-1", "99", "999999999999999999999999"}) {
            Map<String, String> params = new HashMap<>();
            params.put("orderNo", "test-order"); params.put("amount", amount);
            assertThatThrownBy(() -> service.handleNotify(params)).isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(orderService);
        service.handleNotify(Map.of("orderNo", "test-order", "amount", "100.00"));
        verify(orderService).markOrderPaid("test-order");
    }

    @Test
    void latePaymentForCancelledOrderIsNotAcknowledgedAsSuccess() {
        OrderRepository orders = mock(OrderRepository.class);
        Order order = new Order(); order.setId(1L); order.setStatus("cancelled");
        when(orders.findByOrderNo("cancelled-order")).thenReturn(Optional.of(order));
        when(orders.findByIdForUpdate(1L)).thenReturn(Optional.of(order));
        OrderService service = new OrderService(orders, mock(TravelEventPublisher.class), mock(CouponService.class), mock(UserService.class));
        assertThatThrownBy(() -> service.markOrderPaid("cancelled-order")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void losingCancellationDoesNotSaveStaleOrderOrReleaseCoupon() {
        OrderRepository orders = mock(OrderRepository.class);
        CouponService coupons = mock(CouponService.class);
        Order order = new Order(); order.setId(1L); order.setUserId(2L); order.setStatus("pending");
        when(orders.findById(1L)).thenReturn(Optional.of(order));
        when(orders.cancelIfPending(1L, 2L)).thenReturn(0);
        OrderService service = new OrderService(orders, mock(TravelEventPublisher.class), coupons, mock(UserService.class));
        assertThatThrownBy(() -> service.cancelOrder(2L, 1L)).isInstanceOf(IllegalArgumentException.class);
        verify(orders, never()).save(any());
        verifyNoInteractions(coupons);
    }
}
