/**
 * 업종 별칭 매핑 — Phase 3 Day 5.
 *
 * NTS 100대 생활업종 정식 명칭 ↔ 사용자가 흔히 쓰는 별칭.
 * 예: "카페" / "커피숍" / "커피전문점" 검색 → "커피음료점" 매칭
 *
 * 매핑 우선순위:
 *   1. 정확히 별칭 매칭 → 정식 명칭
 *   2. 정식 명칭 substring 매칭 (대소문자 무시)
 *   3. 별칭 substring 매칭
 */

// 정식 명칭 → 별칭 배열
export const UPJONG_ALIASES: Record<string, string[]> = {
  // 음식점·카페
  커피음료점: ["카페", "커피", "커피숍", "커피전문점", "찻집", "다방", "커피집", "에스프레소", "스타벅스"],
  한식음식점: ["한식", "한식당", "백반", "한정식", "국밥", "찌개", "한식집"],
  중식음식점: ["중식", "중국집", "짜장면", "중화요리", "중식당"],
  일식음식점: ["일식", "초밥", "스시", "일식당", "라멘", "돈가스집"],
  기타외국식음식점: ["양식", "양식당", "이탈리안", "파스타집", "프렌치", "스테이크"],
  분식점: ["분식", "떡볶이", "김밥", "라면집", "분식당"],
  패스트푸드점: ["패스트푸드", "햄버거", "맥도날드", "롯데리아", "버거킹", "kfc", "버거"],
  치킨전문점: ["치킨", "치킨집", "통닭집", "후라이드", "양념치킨"],
  제과점: ["빵집", "베이커리", "파리바게뜨", "뚜레쥬르", "케이크집", "빵"],
  아이스크림판매점: ["아이스크림", "빙수", "젤라또", "디저트"],

  // 주점
  간이주점: ["주점", "이자카야", "선술집", "포차"],
  호프주점: ["호프집", "맥주집", "펍", "비어"],

  // 소매
  편의점: ["cu", "gs25", "세븐일레븐", "이마트24", "미니스톱"],
  슈퍼마켓: ["슈퍼", "마트", "동네마트", "구멍가게"],
  화장품가게: ["화장품", "코스메틱", "올리브영", "뷰티"],
  의류점: ["옷가게", "옷집", "패션", "쇼핑몰", "부티크"],
  신발가게: ["신발", "운동화", "구두"],
  안경점: ["안경", "선글라스"],
  서점: ["책방", "도서"],
  완구점: ["장난감", "토이"],
  가구점: ["가구", "퍼니처"],
  가전제품판매점: ["가전", "전자제품"],
  휴대폰가게: ["폰", "핸드폰", "휴대폰", "스마트폰", "통신사"],
  꽃집: ["꽃", "플라워", "플로리스트"],
  애완용품가게: ["애완", "반려", "반려동물", "강아지용품", "고양이용품", "펫"],
  주유소: ["주유", "기름집", "셀프주유소"],

  // 서비스
  미용실: ["미장원", "헤어샵", "이용실", "이발소", "헤어", "미용", "헤어디자이너"],
  피부관리업: ["피부관리", "에스테틱", "피부샵", "스킨케어"],
  세탁소: ["세탁", "드라이클리닝", "런드리"],
  부동산중개업: ["부동산", "공인중개사", "복덕방"],
  여행사: ["여행", "관광"],
  pc방: ["피시방", "PC방", "게임방"],
  노래방: ["노래", "코노", "코인노래방"],
  헬스클럽: ["헬스", "헬스장", "피트니스", "체육관", "짐", "운동"],
  당구장: ["당구", "포켓볼"],
  볼링장: ["볼링"],
  스크린골프: ["골프연습장", "골프", "스크린골프장"],

  // 학원
  교습학원: ["학원", "보습학원", "교과학원"],
  외국어학원: ["영어학원", "어학원", "외국어"],
  예체능학원: ["피아노학원", "미술학원", "태권도", "체육"],

  // 의료
  내과: ["내과의원"],
  치과: ["치과의원"],
  한의원: ["한방", "한의"],
  병원: ["종합병원", "병의원"],
  종합병원: ["대학병원", "큰병원"],
  약국: ["pharmacy", "약방"],

  // 전문직
  변호사: ["법무법인", "법률사무소"],
  변리사: ["특허"],
  공인회계사: ["회계", "회계법인", "세무사", "세무"],
  법무사: ["등기"],

  // 기타
  교회: ["성당", "절"],
  사진촬영업: ["사진관", "스튜디오"],
  세무사: ["세무", "세무사사무실"],
  종합소매점: ["잡화점", "잡화"],
  중고차판매점: ["중고차", "차량판매"],
  자동차정비업: ["카센터", "정비소"],
};

// reverse lookup 사전 (별칭 → 정식 명칭) — 구조 빌드 시 1번
const ALIAS_TO_OFFICIAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [official, aliases] of Object.entries(UPJONG_ALIASES)) {
    for (const a of aliases) {
      m.set(a.toLowerCase(), official);
    }
    m.set(official.toLowerCase(), official); // 정식 명칭 자체도
  }
  return m;
})();

/**
 * 사용자 입력 → 매칭되는 정식 업종명 리스트.
 *
 * 우선순위:
 *   1. 정확 매칭 (별칭 사전)
 *   2. 정식 명칭 substring 시작 매칭
 *   3. 별칭 substring 시작 매칭
 *   4. substring 포함 매칭 (이름 어디든)
 */
export function searchUpjong(query: string, allUpjongs: string[], limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: string[] = [];
  const seen = new Set<string>();

  // 1. 정확 매칭 (별칭 사전)
  const exact = ALIAS_TO_OFFICIAL.get(q);
  if (exact && allUpjongs.includes(exact)) {
    results.push(exact);
    seen.add(exact);
  }

  // 2. 정식 명칭 시작 매칭
  for (const u of allUpjongs) {
    if (seen.has(u)) continue;
    if (u.toLowerCase().startsWith(q)) {
      results.push(u);
      seen.add(u);
      if (results.length >= limit) return results;
    }
  }

  // 3. 별칭 시작 매칭 → 정식 명칭
  for (const [alias, official] of Array.from(ALIAS_TO_OFFICIAL.entries())) {
    if (seen.has(official)) continue;
    if (alias.startsWith(q) && allUpjongs.includes(official)) {
      results.push(official);
      seen.add(official);
      if (results.length >= limit) return results;
    }
  }

  // 4. substring 포함 (정식 명칭)
  for (const u of allUpjongs) {
    if (seen.has(u)) continue;
    if (u.toLowerCase().includes(q)) {
      results.push(u);
      seen.add(u);
      if (results.length >= limit) return results;
    }
  }

  // 5. substring 포함 (별칭)
  for (const [alias, official] of Array.from(ALIAS_TO_OFFICIAL.entries())) {
    if (seen.has(official)) continue;
    if (alias.includes(q) && allUpjongs.includes(official)) {
      results.push(official);
      seen.add(official);
      if (results.length >= limit) return results;
    }
  }

  return results;
}
