package org.example.traveljava;

import org.example.traveljava.config.ApiSecurityConfig;
import org.example.traveljava.config.JwtAuthenticationFilter;
import org.example.traveljava.controller.PostController;
import org.example.traveljava.entity.Post;
import org.example.traveljava.service.PostService;
import org.example.traveljava.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest
@ContextConfiguration(classes = {PostController.class, ApiSecurityConfig.class, JwtAuthenticationFilter.class})
class ApiSecurityConfigTest {

    @Autowired
    private MockMvc mvc;

    @MockBean
    private PostService postService;

    @MockBean
    private JwtUtil jwtUtil;

    @Test
    void publicReadRemainsAnonymousButWriteRequiresJwt() throws Exception {
        when(postService.getPosts(null, 0, 10)).thenReturn(Map.of("list", java.util.List.of()));

        mvc.perform(get("/api/posts"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/user/profile"))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"test\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("请先登录"));
    }

    @Test
    void validJwtCanReachProtectedWrite() throws Exception {
        Post post = new Post();
        post.setId(1L);
        post.setContent("test");
        when(jwtUtil.extractUserId("valid-token")).thenReturn(7L);
        when(postService.createPost(eq(7L), any())).thenReturn(post);

        mvc.perform(post("/api/posts")
                        .header("Authorization", "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"test\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
    }
}
