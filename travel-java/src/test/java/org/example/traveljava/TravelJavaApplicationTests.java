package org.example.traveljava;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

// 只加载 JSON 配置；测试不启动数据库、Redis、定时退款任务或管理员初始化。
@JsonTest
class TravelJavaApplicationTests {

    @Test
    void contextLoads() {
    }

}
