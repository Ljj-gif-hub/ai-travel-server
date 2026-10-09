package org.example.traveljava.service;

import org.example.traveljava.repository.SavedTravelPlanRepository;
import org.example.traveljava.repository.OrderRepository;
import org.example.traveljava.repository.NoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class ProfileStatsService {
    private final SavedTravelPlanRepository plans;
    private final OrderRepository orders;
    private final NoteRepository notes;

    public ProfileStatsService(SavedTravelPlanRepository plans, OrderRepository orders, NoteRepository notes) {
        this.plans = plans; this.orders = orders; this.notes = notes;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getStats(Long userId) {
        // 保存的规划并不代表实际出行；使用独立字段，保留旧客户端的字段契约。
        return Map.of("plannedCities", plans.countDestinations(userId),
                "plannedDays", plans.sumDays(userId), "paidTotal", orders.sumPaidTotal(userId),
                "publishedNotes", notes.countByUserIdAndStatus(userId, "published"));
    }
}
