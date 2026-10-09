package org.example.traveljava.repository;

import org.example.traveljava.entity.SavedTravelPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SavedTravelPlanRepository extends JpaRepository<SavedTravelPlan, Long> {
    @org.springframework.data.jpa.repository.Query("select count(distinct p.destination) from SavedTravelPlan p where p.userId = :userId and p.destination is not null and trim(p.destination) <> ''")
    long countDestinations(@org.springframework.data.repository.query.Param("userId") Long userId);

    @org.springframework.data.jpa.repository.Query("select coalesce(sum(p.days), 0) from SavedTravelPlan p where p.userId = :userId and p.days > 0")
    long sumDays(@org.springframework.data.repository.query.Param("userId") Long userId);

    List<SavedTravelPlan> findAllByOrderByCreatedAtDesc();

    List<SavedTravelPlan> findByUserIdOrderByCreatedAtDesc(Long userId);

    boolean existsByUserIdAndId(Long userId, Long id);
}
