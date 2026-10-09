package org.example.traveljava;

import org.example.traveljava.entity.User;
import org.example.traveljava.repository.UserRepository;
import org.example.traveljava.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(showSql = false, properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ProfileCheckInTests {
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactions;
    @Autowired org.example.traveljava.repository.SavedTravelPlanRepository plans;
    @Autowired org.example.traveljava.repository.OrderRepository orders;
    @Autowired org.example.traveljava.repository.NoteRepository notes;

    private User user(String name) {
        User u = new User(); u.setUsername(name); u.setPassword("test-only"); u.setPoints(95);
        return users.saveAndFlush(u);
    }

    @Test
    void concurrentCheckInAwardsOnceAndPersistsAcrossReloads() throws Exception {
        User u = user("check-in-concurrent"), other = user("check-in-other");
        var service = new UserService(users, null, null, null, null);
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        Callable<Integer> task = () -> {
            start.await(5, TimeUnit.SECONDS);
            return new TransactionTemplate(transactions).execute(tx -> (Integer) service.checkIn(u.getId()).get("awardedPoints"));
        };
        try {
            var a = pool.submit(task); var b = pool.submit(task); start.countDown();
            assertThat(a.get(10, TimeUnit.SECONDS) + b.get(10, TimeUnit.SECONDS)).isEqualTo(5);
            assertThat(users.findById(u.getId()).orElseThrow().getPoints()).isEqualTo(100);
            assertThat(service.getUserLevel(u.getId())).containsEntry("checkedIn", true).containsEntry("level", "白银");
            assertThat(users.findById(other.getId()).orElseThrow().getPoints()).isEqualTo(95);
            assertThat(service.getUserLevel(other.getId())).containsEntry("checkedIn", false);
        } finally { pool.shutdownNow(); }
    }

    @Test
    void nextDayAllowsAnotherCheckInButOldDatesDoNot() {
        User u = user("check-in-next-day");
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            assertThat(users.checkInIfNewDay(u.getId(), today)).isEqualTo(1);
            assertThat(users.checkInIfNewDay(u.getId(), today)).isZero();
            assertThat(users.checkInIfNewDay(u.getId(), today.minusDays(1))).isZero();
            assertThat(users.checkInIfNewDay(u.getId(), today.plusDays(1))).isEqualTo(1);
        });
        assertThat(users.findById(u.getId()).orElseThrow().getPoints()).isEqualTo(105);
    }

    @Test
    void statisticsReflectRealRecordsAndExcludeOtherAccountsAndUnpaidOrders() {
        User u = user("stats-owner"), other = user("stats-other");
        for (long id : new long[]{u.getId(), other.getId()}) {
            for (int i = 0; i < 2; i++) {
                var p = new org.example.traveljava.entity.SavedTravelPlan();
                p.setUserId(id); p.setDestination("北京"); p.setDays(3); plans.saveAndFlush(p);
            }
            for (String status : new String[]{"pending", "paid", "cancelled"}) {
                var o = new org.example.traveljava.entity.Order();
                o.setUserId(id); o.setType("hotel"); o.setPrice(123L); o.setStatus(status); orders.saveAndFlush(o);
            }
            for (String status : new String[]{"draft", "published"}) {
                var n = new org.example.traveljava.entity.Note();
                n.setUserId(id); n.setTitle("test"); n.setStatus(status); notes.saveAndFlush(n);
            }
        }
        var stats = new org.example.traveljava.service.ProfileStatsService(plans, orders, notes).getStats(u.getId());
        assertThat(stats).containsEntry("plannedCities", 1L).containsEntry("plannedDays", 6L)
                .containsEntry("paidTotal", 123L).containsEntry("publishedNotes", 1);
    }

    @Test
    void editingProfileCannotOverwriteConcurrentCheckIn() throws Exception {
        User u = user("check-in-profile-edit");
        var pool = Executors.newSingleThreadExecutor();
        var service = new UserService(users, null, null, null, null);
        try {
            new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                User editing = users.findById(u.getId()).orElseThrow();
                try {
                    pool.submit(() -> new TransactionTemplate(transactions).execute(inner -> service.checkIn(u.getId())))
                            .get(10, TimeUnit.SECONDS);
                } catch (Exception e) { throw new AssertionError(e); }
                editing.setNickname("Updated nickname");
                users.saveAndFlush(editing);
            });
            User updated = users.findById(u.getId()).orElseThrow();
            assertThat(updated.getNickname()).isEqualTo("Updated nickname");
            assertThat(updated.getPoints()).isEqualTo(100);
            assertThat(updated.getLastCheckInDate()).isEqualTo(LocalDate.now(ZoneId.of("Asia/Shanghai")));
        } finally { pool.shutdownNow(); }
    }
}
