package org.example.traveljava.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.traveljava.vo.Result;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import java.nio.charset.StandardCharsets;

/**
 * API 安全边界：公开接口显式放行，其余接口默认要求有效 JWT。
 * 控制器中的用户归属和管理员校验继续作为业务级纵深防御。
 *
 * 【新功能-安全头】在 Security 链上统一追加：
 *  - X-Content-Type-Options: nosniff
 *  - X-Frame-Options: DENY
 *  - Referrer-Policy: strict-origin-when-cross-origin
 *  CSP 刻意不在此设置：前端依赖百度地图/高德地图等外部脚本域及大量内联样式，
 *  收紧 CSP 会导致页面白屏；现有 SecurityHeaderFilter 已提供宽松 CSP 兜底。
 */
@Configuration
public class ApiSecurityConfig {

    @Bean
    public SecurityFilterChain apiSecurityFilterChain(HttpSecurity http,
                                                      JwtAuthenticationFilter jwtAuthenticationFilter,
                                                      ObjectMapper objectMapper) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/error", "/api/auth/**", "/api/payment/notify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/cost/breakdown").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/actuator/health",
                                "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**",
                                "/api/agent/health", "/api/travel/hello", "/api/travel/health",
                                "/api/voice/health", "/api/weather/**", "/api/cost/estimate",
                                "/api/city/**", "/api/map/**", "/api/proxy/image",
                                "/api/files/**", "/api/scene/**", "/api/recommend/**",
                                "/api/flight/search", "/api/hotel/**",
                                "/api/posts", "/api/notes", "/api/notes/*/card",
                                "/api/notes/*/comments", "/api/comments/*/replies",
                                "/api/collection/public", "/api/collection/*",
                                "/api/share/*", "/api/trip/share/*",
                                "/api/template/market", "/api/template/*")
                        .permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(401);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                            objectMapper.writeValue(response.getWriter(), Result.fail("请先登录"));
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            response.setStatus(403);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                            objectMapper.writeValue(response.getWriter(), Result.fail("无权限执行该操作"));
                        }))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .headers(headers -> headers
                        // nosniff：禁止浏览器 MIME 嗅探
                        .contentTypeOptions(contentTypeOptions -> {})
                        // 禁止页面被嵌入 iframe（防点击劫持）
                        .frameOptions(frame -> frame.deny())
                        // 跨域降级时只带 origin，不带完整 URL
                        .referrerPolicy(referrer -> referrer.policy(
                                ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                );
        return http.build();
    }
}
