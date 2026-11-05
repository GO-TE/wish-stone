package com.stonewish.interaction.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * Sprint 5: interaction_db.reports 테이블 매핑 JPA 엔티티 (uk_wish_reporter 복합 유니크 인덱스)
 * 근거: backend/sql/init-databases.sql 3장
 */
@Entity
@Table(
    name = "reports",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_wish_reporter", columnNames = {"wish_id", "reporter_id"})
    },
    indexes = {
        @Index(name = "idx_reports_wish", columnList = "wish_id")
    }
)
public class ReportEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "wish_id", length = 36, nullable = false)
    private String wishId;

    @Column(name = "reporter_id", length = 36, nullable = false)
    private String reporterId;

    @Column(name = "reason", length = 30, nullable = false)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ReportEntity() {
    }

    public ReportEntity(String wishId, String reporterId, String reason, Instant createdAt) {
        this.wishId = wishId;
        this.reporterId = reporterId;
        this.reason = reason;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getWishId() {
        return wishId;
    }

    public String getReporterId() {
        return reporterId;
    }

    public String getReason() {
        return reason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
