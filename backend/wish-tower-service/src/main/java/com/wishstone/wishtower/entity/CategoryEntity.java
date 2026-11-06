package com.wishstone.wishtower.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Sprint 5+: wish_db.categories 테이블 매핑 JPA 엔티티
 * 근거: backend/sql/init-databases.sql 2장 (API-16 GET /api/v1/categories)
 */
@Entity
@Table(name = "categories")
public class CategoryEntity {

    @Id
    @Column(name = "code", length = 20, nullable = false)
    private String code;

    @Column(name = "label", length = 30, nullable = false)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected CategoryEntity() {
    }

    public CategoryEntity(String code, String label, int sortOrder) {
        this.code = code;
        this.label = label;
        this.sortOrder = sortOrder;
    }

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
