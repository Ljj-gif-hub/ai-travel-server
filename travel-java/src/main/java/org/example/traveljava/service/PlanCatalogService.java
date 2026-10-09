package org.example.traveljava.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.traveljava.entity.PlanCatalog;
import org.example.traveljava.repository.PlanCatalogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

@Service
public class PlanCatalogService {

    private static final Logger log = LoggerFactory.getLogger(PlanCatalogService.class);
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final PlanCatalogRepository repository;
    private final ObjectMapper objectMapper;

    public PlanCatalogService(PlanCatalogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public static boolean customized(Map<String, Object> body) {
        Object adj = body == null ? null : body.get("adjustment");
        return adj != null && !adj.toString().isBlank();
    }

    public static int daysOf(Map<String, Object> body) {
        Object d = body == null ? null : body.get("days");
        if (d instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(d));
        } catch (Exception e) {
            return 3;
        }
    }

    public Optional<Map<String, Object>> find(String destination, int days) {
        if (!usable(destination, days)) return Optional.empty();
        return repository.findByDestinationAndDays(destination.trim(), days).map(row -> {
            try {
                return objectMapper.readValue(row.getPlanJson(), MAP);
            } catch (Exception e) {
                log.warn("库存 JSON 损坏 dest={} days={}", destination, days);
                return null;
            }
        });
    }

    @Transactional
    public void upsert(String destination, int days, Object plan) {
        if (!usable(destination, days) || plan == null) return;
        try {
            String dest = destination.trim();
            String json = objectMapper.writeValueAsString(plan);
            PlanCatalog row = repository.findByDestinationAndDays(dest, days).orElseGet(PlanCatalog::new);
            row.setDestination(dest);
            row.setDays(days);
            row.setPlanJson(json);
            repository.save(row);
            log.info("行程写回库存 dest={} days={}", dest, days);
        } catch (Exception e) {
            log.warn("写回库存失败 dest={} days={}: {}", destination, days, e.getMessage());
        }
    }

    /** SSE 块里若是 complete 事件，把 data 写回库存。 */
    public void saveFromSseChunk(String destination, int days, String chunk) {
        if (chunk == null) return;
        String raw = chunk.trim();
        if (raw.startsWith("data:")) raw = raw.substring(5).trim();
        if (raw.isEmpty() || raw.charAt(0) != '{') return;
        try {
            Map<String, Object> ev = objectMapper.readValue(raw, MAP);
            if (!"complete".equals(ev.get("event_type"))) return;
            Object data = ev.get("data");
            if (data instanceof Map<?, ?> plan && !plan.isEmpty()) {
                upsert(destination, days, plan);
            }
        } catch (Exception ignored) {
            // 半包/非 JSON 块直接跳过
        }
    }

    private static boolean usable(String destination, int days) {
        return destination != null && !destination.isBlank()
                && !"unknown".equalsIgnoreCase(destination.trim())
                && days >= 1 && days <= 14;
    }
}
