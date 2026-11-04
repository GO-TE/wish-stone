package com.stonewish.wishtower.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * [사수 멘토링 포인트 - 소원 카테고리 자동 분류기 (D-016)]
 * 유저가 소원을 적을 때 카테고리를 직접 고르게 하면 입력 단계가 늘어나 이탈률이 높아집니다.
 * 1) 1차 동기 분류 (0ms 지연): 본문 키워드 가중치 매칭으로 저장 즉시 기본 카테고리를 부여합니다.
 * 2) 2차 사후 수정 허용: 만약 자동 분류가 유저 의도와 다르면 PATCH /api/v1/wishes/{id}/category 로
 *    언제든 바꿀 수 있게 열어둡니다.
 */
@Component
public class CategoryAutoClassifier {

    private static final Map<String, List<String>> CATEGORY_KEYWORDS = new LinkedHashMap<>();

    static {
        CATEGORY_KEYWORDS.put("job", List.of(
            "취업", "합격", "면접", "이직", "출근", "퇴사", "연봉", "회사", "자소서", "채용", "공채"
        ));
        CATEGORY_KEYWORDS.put("study", List.of(
            "수능", "시험", "학점", "공부", "자격증", "장학금", "대학", "성적", "만점", "중간고사", "기말고사"
        ));
        CATEGORY_KEYWORDS.put("health", List.of(
            "건강", "수술", "아프", "완치", "병원", "회복", "다이어트", "체력", "장수", "쾌유"
        ));
        CATEGORY_KEYWORDS.put("relation", List.of(
            "연애", "사랑", "가족", "친구", "부모님", "엄마", "아빠", "결혼", "화해", "인연", "행복"
        ));
    }

    public String classify(String content) {
        if (content == null || content.isBlank()) {
            return "etc";
        }

        String bestCategory = "etc";
        int maxMatches = 0;

        for (Map.Entry<String, List<String>> entry : CATEGORY_KEYWORDS.entrySet()) {
            int matches = 0;
            for (String keyword : entry.getValue()) {
                if (content.contains(keyword)) {
                    matches++;
                }
            }
            if (matches > maxMatches) {
                maxMatches = matches;
                bestCategory = entry.getKey();
            }
        }

        return bestCategory;
    }
}
