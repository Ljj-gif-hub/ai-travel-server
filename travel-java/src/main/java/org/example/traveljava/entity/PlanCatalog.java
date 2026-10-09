package org.example.traveljava.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 公共行程库存：按目的地+天数缓存已生成方案，下次直出。
 * ponytail: 键只有 dest+days，偏好碰撞再把 styles 加进唯一键。
 */
@Entity
@Table(name = "plan_catalog", uniqueConstraints = {
        @UniqueConstraint(name = "uk_plan_catalog_dest_days", columnNames = {"destination", "days"})
})
public class PlanCatalog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String destination;

    @Column(nullable = false)
    private Integer days;

    @Column(name = "plan_json", nullable = false, columnDefinition = "LONGTEXT")
    private String planJson;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public Integer getDays() { return days; }
    public void setDays(Integer days) { this.days = days; }
    public String getPlanJson() { return planJson; }
    public void setPlanJson(String planJson) { this.planJson = planJson; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
