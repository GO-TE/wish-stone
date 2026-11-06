package com.wishstone.interaction.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Sprint 5: interaction_db.cheers 테이블 매핑 JPA 엔티티 (복합 PK: wish_id, user_id)
 * 근거: backend/sql/init-databases.sql 3장
 */
@Entity
@Table(
    name = "cheers",
    indexes = {
        @Index(name = "idx_cheers_wish_created", columnList = "wish_id, created_at")
    }
)
@IdClass(CheerEntity.CheerId.class)
public class CheerEntity {

    public static class CheerId implements Serializable {
        private String wishId;
        private String userId;

        public CheerId() {
        }

        public CheerId(String wishId, String userId) {
            this.wishId = wishId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof CheerId that)) return false;
            return Objects.equals(wishId, that.wishId) && Objects.equals(userId, that.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(wishId, userId);
        }
    }

    @Id
    @Column(name = "wish_id", length = 36, nullable = false)
    private String wishId;

    @Id
    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected CheerEntity() {
    }

    public CheerEntity(String wishId, String userId, Instant createdAt) {
        this.wishId = wishId;
        this.userId = userId;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public String getWishId() {
        return wishId;
    }

    public String getUserId() {
        return userId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
