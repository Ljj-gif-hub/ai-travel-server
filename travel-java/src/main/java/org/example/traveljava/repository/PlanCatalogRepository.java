package org.example.traveljava.repository;

import org.example.traveljava.entity.PlanCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlanCatalogRepository extends JpaRepository<PlanCatalog, Long> {
    Optional<PlanCatalog> findByDestinationAndDays(String destination, Integer days);
}
