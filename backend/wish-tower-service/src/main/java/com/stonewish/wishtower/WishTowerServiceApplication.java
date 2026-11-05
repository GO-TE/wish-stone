package com.stonewish.wishtower;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients(basePackages = "com.stonewish.wishtower.client")
public class WishTowerServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(WishTowerServiceApplication.class, args);
    }
}
