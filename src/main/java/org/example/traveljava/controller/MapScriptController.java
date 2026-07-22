package org.example.traveljava.controller;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 地图脚本代理控制器
 * 优先代理百度地图 GL SDK（需配置 AK），AK 未配置时返回状态提示脚本
 */
@RestController
@RequestMapping("/api/map")
public class MapScriptController {

    private final RestTemplate restTemplate;

    @Value("${baidu.map.ak:}")
    private String baiduAk;

    public MapScriptController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @GetMapping("/script")
    public void getMapScript(HttpServletResponse response) {
        try {
            // AK 未配置：返回提示脚本，前端降级到 Leaflet 免费地图
            if (baiduAk == null || baiduAk.isEmpty()) {
                String fallbackScript =
                    "// 百度地图 AK 未配置，请在前端使用 Leaflet 免费地图\n" +
                    "console.warn('[地图] 百度地图 AK 未配置，前端将降级使用 Leaflet/OSM 免费地图');\n" +
                    "window.BMapGL = undefined;\n" +
                    "window._baiduMapUnavailable = true;\n";
                response.setContentType("application/javascript;charset=UTF-8");
                response.setCharacterEncoding("UTF-8");
                response.getOutputStream().write(fallbackScript.getBytes(StandardCharsets.UTF_8));
                response.getOutputStream().flush();
                return;
            }

            String scriptUrl = String.format(
                    "https://api.map.baidu.com/api?v=3.0&ak=%s&type=webgl&callback=_baiduMapInit",
                    baiduAk
            );

            String scriptContent = restTemplate.getForObject(scriptUrl, String.class);

            if (scriptContent == null || scriptContent.isEmpty()) {
                response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "地图脚本加载失败");
                return;
            }

            response.setContentType("application/javascript;charset=UTF-8");
            response.setCharacterEncoding("UTF-8");
            response.setHeader("Cache-Control", "public, max-age=86400");
            response.getOutputStream().write(scriptContent.getBytes(StandardCharsets.UTF_8));
            response.getOutputStream().flush();

        } catch (Exception e) {
            // 网络异常时也返回降级脚本
            try {
                String fallbackScript =
                    "console.warn('[地图] 百度地图加载失败，前端将降级使用 Leaflet 免费地图');\n" +
                    "window.BMapGL = undefined;\n" +
                    "window._baiduMapUnavailable = true;\n";
                response.setContentType("application/javascript;charset=UTF-8");
                response.getOutputStream().write(fallbackScript.getBytes(StandardCharsets.UTF_8));
                response.getOutputStream().flush();
            } catch (IOException ex) {
                // ignore
            }
        }
    }
}
