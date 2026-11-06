package com.wishstone.wishtower.repository;

import com.wishstone.wishtower.entity.CategoryEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryJpaRepository extends JpaRepository<CategoryEntity, String> {

    List<CategoryEntity> findAllByOrderBySortOrderAsc();
}
