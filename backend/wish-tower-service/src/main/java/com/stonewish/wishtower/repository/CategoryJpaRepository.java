package com.stonewish.wishtower.repository;

import com.stonewish.wishtower.entity.CategoryEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryJpaRepository extends JpaRepository<CategoryEntity, String> {

    List<CategoryEntity> findAllByOrderBySortOrderAsc();
}
