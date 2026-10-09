package org.example.traveljava;

import org.example.traveljava.entity.Order;
import org.example.traveljava.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

/** 在隔离 H2 数据库里测试真实条件更新，不连接项目数据库。 */
@DataJpaTest(showSql = false, properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OrderConcurrencyTests {
    @Autowired OrderRepository orders;
    @Autowired PlatformTransactionManager transactions;

    private Order pending() {
        Order order = new Order();
        order.setUserId(1L);
        order.setType("hotel");
        order.setStatus("pending");
        order.setPrice(100L);
        return orders.saveAndFlush(order);
    }

    private void await(CountDownLatch latch) {
        latch.countDown();
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("Concurrent read timed out");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }

    @Test
    void differentCouponsCannotStackAfterBothReadPending() throws Exception {
        Order order = pending();
        CountDownLatch read = new CountDownLatch(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> first = pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                assertThat(orders.findById(order.getId()).orElseThrow().getCouponId()).isNull();
                await(read);
                return orders.applyCouponIfPending(order.getId(), 80, 11L, 80);
            }));
            Future<Integer> second = pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                assertThat(orders.findById(order.getId()).orElseThrow().getCouponId()).isNull();
                await(read);
                return orders.applyCouponIfPending(order.getId(), 80, 12L, 80);
            }));
            assertThat(first.get(10, TimeUnit.SECONDS) + second.get(10, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(orders.findById(order.getId()).orElseThrow().getPrice()).isEqualTo(20L);
        } finally { pool.shutdownNow(); }
    }

    @Test
    void createdPaymentPreventsLaterPriceChange() {
        Order order = pending();
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            orders.findByOrderNoForUpdate(order.getOrderNo()).orElseThrow();
            assertThat(orders.updatePaymentInfoIfPending(order.getId(), "mock", "trade-1")).isEqualTo(1);
        });
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            assertThat(orders.applyCouponIfPending(order.getId(), 80, 11L, 80)).isZero();
        });
        assertThat(orders.findById(order.getId()).orElseThrow().getPrice()).isEqualTo(100L);
    }

    @Test
    void paymentAndCancellationCannotBothWin() throws Exception {
        Order order = pending();
        CountDownLatch read = new CountDownLatch(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> cancel = pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                assertThat(orders.findById(order.getId()).orElseThrow().getStatus()).isEqualTo("pending");
                await(read);
                return orders.cancelIfPending(order.getId(), 1L);
            }));
            Future<Integer> pay = pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                assertThat(orders.findById(order.getId()).orElseThrow().getStatus()).isEqualTo("pending");
                await(read);
                return orders.markPaidIfPending(order.getOrderNo(), LocalDateTime.now(), "mock");
            }));
            int paid = pay.get(10, TimeUnit.SECONDS);
            assertThat(cancel.get(10, TimeUnit.SECONDS) + paid).isEqualTo(1);
            Order result = orders.findById(order.getId()).orElseThrow();
            assertThat(result.getStatus()).isEqualTo(paid == 1 ? "paid" : "cancelled");
            assertThat(result.getPaidAt() != null).isEqualTo(paid == 1);
        } finally { pool.shutdownNow(); }
    }
}
