---
notion-id: 3b3bd15cbfe780048d46f3ad49e7e6b6
설계: 시작 전
---
마이크로서비스 아키텍처(MSA) 처음 분리하는 거라면 **코드부터 쪼개면 실패할 가능성이 높습니다.** 먼저 “서비스 경계”를 잡는 게 핵심입니다.

보통 아래 순서로 진행합니다.

---

## 1. 현재 시스템 분석 (모놀리식 기준)

먼저 현재 앱을 기능 단위로 나눠봅니다.

예:

```
쇼핑몰 모놀리식

- 회원
- 상품
- 주문
- 결제
- 배송
- 알림
- 관리자
```

여기서 중요한 질문:

- 이 기능은 독립적인 업무 영역인가?
- 변경 주기가 다른가?
- 장애가 나면 다른 기능까지 영향이 가는가?
- 자체 데이터가 필요한가?

---

## 2. 도메인 기준으로 서비스 경계 나누기

처음부터 "회원 서비스", "상품 서비스", "주문 서비스"처럼 나누는 경우가 많습니다.

예:

```
기존

Application
 ├ User
 ├ Product
 ├ Order
 ├ Payment
 └ Delivery
        |
      DB 하나


변경 후

User Service
      |
 User DB

Product Service
      |
 Product DB

Order Service
      |
 Order DB

Payment Service
      |
 Payment DB
```

핵심 원칙:

> 하나의 서비스가 하나의 비즈니스 책임을 가진다.

---

## 3. DB 분리 결정

MSA에서 가장 큰 변화입니다.

기존:

```
서비스 A
서비스 B
서비스 C
    |
    DB
```

MSA:

```
서비스 A → DB A

서비스 B → DB B

서비스 C → DB C
```

이유:

- 서비스 간 결합도를 낮춤
- 독립 배포 가능
- 장애 격리 가능

하지만 처음부터 DB까지 완벽히 분리하면 난도가 올라갑니다.

처음에는:

```
코드는 서비스 분리
DB는 공유
        ↓
점진적으로 DB 분리
```

방식도 많이 씁니다.

---

## 4. API 경계 만들기

서비스끼리는 직접 코드 호출하면 안 됩니다.

나쁜 예:

```
OrderService|UserService.java 직접 호출
```

좋은 예:

```
Order Service

       HTTP / gRPC

       ↓

User Service API
```

예:

```
GET /users/{id}

응답:
{
 "id": 123,
 "name": "kim"
}
```

---

## 5. 한 번에 다 옮기지 않기 (중요)

보통 **Strangler Pattern**으로 갑니다.

기존:

```
             사용자 요청
                 |
            Monolith
```

점진적:

```
             사용자 요청
                 |
             Gateway
              /    \
       User Service  Monolith
                    |
          Order/Product...
```

하나씩 떼어냅니다.

추천 순서 예:

1. 알림
2. 파일 처리
3. 검색
4. 회원
5. 상품
6. 주문
7. 결제

처음부터 주문/결제 같은 핵심 도메인을 떼면 위험합니다.

---

## 6. 필요한 인프라 준비

보통 추가되는 것:

- API Gateway
- 서비스 Discovery
- Config 관리
- 메시지 브로커(Kafka 등)
- 로그/모니터링
- CI/CD

예:

```
Client
  |
Gateway
  |
----------------
|      |       |
User  Order  Payment

        |
      Kafka

        |
 Notification
```

---

## 처음 MSA 분리할 때 추천하는 작은 목표

예를 들어 Spring 기반이라면:

1. 기존 Monolith 유지
2. "알림 서비스" 하나 분리
3. REST API 통신
4. Docker 배포
5. CI/CD 연결
6. 모니터링 추가
7. 다음 서비스 분리

이렇게 한 서비스씩 경험하는 게 좋습니다.

---

처음 분리하는 상황이면 몇 가지를 알려주면 더 정확하게 잡을 수 있습니다.

1. 현재 기술 스택이 뭐예요? (예: Spring Boot, Node, Django 등)
2. 지금 구조가 모놀리식인가요?
3. 어떤 시스템인지요? (쇼핑몰, 사내 서비스, 금융, 게임 등)
4. "MSA 전환 프로젝트"인지, 그냥 공부용인지요?

  

아까 말한 **4번(API 경계 만들기)** 단계에서 필요한 기술과 지식은 꽤 명확합니다. 핵심은 **"서비스 간 통신 설계"**입니다.

MSA에서 API 경계를 만든다는 건 단순히 REST API 하나 만드는 게 아니라:

> "이 서비스가 무엇을 책임지고, 다른 서비스가 어떻게 요청해야 하는가"

를 정의하는 작업입니다.

필요한 지식을 순서대로 보면:

---

## 1. REST API 설계 지식 (필수)

가장 기본입니다.

알아야 하는 것:

- HTTP 메서드
	- GET
	- POST
	- PUT/PATCH
	- DELETE
- HTTP 상태 코드
	- 200 OK
	- 201 Created
	- 400 Bad Request
	- 401 Unauthorized
	- 404 Not Found
	- 500 Internal Server Error
- Resource 중심 설계

예:

나쁜 API:

```
POST /createUser
POST /getUserInfo
```

좋은 API:

```
POST /users

GET /users/{id}
```

---

## 2. 서비스 간 통신 방식

MSA에서는 서비스끼리 대화해야 합니다.

대표적으로 두 가지:

---

### 동기 통신 (Request → Response)

대표:

- REST
- gRPC

예:

```
Order Service

"회원 정보 줘"

        ↓ HTTP

User Service

"김철수입니다"
```

기술:

- Spring MVC
- WebClient
- OpenFeign
- gRPC

사용 상황:

"지금 당장 결과가 필요하다"

예:

- 주문 생성 전에 회원 확인

---

### 비동기 통신 (Event 기반)

대표:

- Kafka
- RabbitMQ

예:

```
Order Service

주문 완료 이벤트 발행

        ↓

Kafka

        ↓

----------------
Payment Service
Notification Service
Statistics Service
```

사용 상황:

"나중에 처리해도 된다"

예:

- 이메일 발송
- 알림
- 통계 업데이트

---

## 3. API Gateway 이해

사용자가 모든 서비스에 직접 접근하지 않게 합니다.

구조:

```
Client

 |
 |
Gateway

 |
 -----------------
 |       |       |
User   Order   Payment
```

알아야 하는 것:

- Routing
- 인증 처리
- Rate Limit
- Logging
- SSL 처리

대표 기술:

- Spring Cloud Gateway
- Kong
- Nginx

---

## 4. 인증/인가 처리

MSA에서 많이 터지는 부분입니다.

모놀리식:

```
Application
 |
Session
 |
DB
```

MSA:

```
Client

 |
JWT Token

 |
Gateway

 |
Service들
```

필요 지식:

- JWT
- OAuth2
- Access Token
- Refresh Token
- Role 기반 권한 관리

예:

요청:

```
GET /orders

Authorization:
Bearer eyJhbGci...
```

각 서비스가 토큰 검증.

---

## 5. API 문서화

서비스가 많아지면 문서 없이는 운영 불가능합니다.

필요:

- OpenAPI
- Swagger

예:

```
Order Service API

POST /orders

Request:
{
 userId: 1,
 productId: 20
}

Response:
{
 orderId: 100
}
```

---

## 6. 장애 처리 지식 (중요)

MSA는 네트워크를 많이 사용하기 때문에 실패를 기본으로 생각해야 합니다.

예:

```
Order Service

       ↓

User Service

       X 장애
```

그럼 주문은 어떻게 할까?

필요 개념:

### Timeout

"5초 기다리고 실패 처리"

---

### Retry

"실패하면 3번 재시도"

---

### Circuit Breaker

대표:

- Resilience4j

동작:

```
정상

Order → User


장애 반복

Order ─X→ User

차단
```

---

## 7. 데이터 일관성

MSA에서 어려운 부분입니다.

예:

주문 생성:

```
Order DB
  ↓
Payment DB
  ↓
Stock DB
```

중간 실패:

```
주문 생성 성공
결제 실패
```

어떻게 되돌릴 것인가?

필요 개념:

- Saga Pattern
- Eventual Consistency
- Transaction 분산 처리

---

# 공부 순서 추천

처음이면 이 순서가 좋습니다.

```
1. REST API 설계
        ↓
2. Spring Boot Controller/Client 통신
        ↓
3. OpenFeign 또는 WebClient
        ↓
4. API Gateway
        ↓
5. JWT 인증
        ↓
6. Kafka 이벤트 통신
        ↓
7. Circuit Breaker
        ↓
8. Saga Pattern
```

---

만약 **Spring Boot 기준으로 MSA 전환**을 생각하는 거라면, 실제로는:

- Spring Cloud Gateway
- OpenFeign
- Eureka(Service Discovery)
- Config Server
- Kafka
- Resilience4j
- Docker
- Kubernetes

정도까지 가게 됩니다.

다만 처음 분리라면 **Gateway + REST 통신 + JWT + Docker** 정도만 해도 "MSA 한 서비스 분리" 경험은 충분히 할 수 있습니다.

그러면 어떻게 구현해야해?  
  
Spring을 여러개 돌린다고 생각하고 중간에 카프카나 아니면 직접적인 api 호출이 있으면 되는건가?

네, 큰 방향은 맞습니다.

MSA를 아주 단순하게 표현하면:

> **Spring Boot 애플리케이션을 여러 개 띄우고, 각각 독립된 책임을 가지게 한 뒤, 필요한 경우 API 호출이나 메시지(Kafka)로 연결하는 구조**

입니다.

하지만 "Spring 여러 개 띄우면 MSA"는 아니고, 몇 가지 중요한 규칙이 있습니다.

---

## 1. 가장 단순한 MSA 구조

예를 들어 쇼핑몰이면:

```
                 Client
                   |
              API Gateway
                   |
        ----------------------
        |          |          |
   User Service  Order     Payment
        |          |          |
     User DB    Order DB  Payment DB
```

실제로는:

```
user-service
    |
    └── Spring Boot (8081 port)

order-service
    |
    └── Spring Boot (8082 port)

payment-service
    |
    └── Spring Boot (8083 port)
```

이렇게 **Spring 프로젝트가 여러 개** 존재합니다.

---

## 2. 직접 API 호출하는 경우

예를 들어 주문 생성:

사용자:

```
주문 버튼 클릭
```

↓

Order Service:

```
POST /orders
```

↓

주문 처리 중:

"이 사용자가 존재하는지 확인해야 함"

↓

User Service 호출:

```
GET http://user-service/users/100
```

흐름:

```
Client
 |
 |
Order Service
 |
 | HTTP 요청
 ↓
User Service
 |
 ↓
User DB
```

Spring에서는 보통:

### OpenFeign 사용

Order Service:

```
@FeignClient(name="user-service")publicinterfaceUserClient {

    @GetMapping("/users/{id}")UserResponsegetUser(
        @PathVariableLongid
    );
}
```

사용:

```
UserResponseuser=userClient.getUser(100L);
```

마치 다른 클래스 호출처럼 보이지만 실제로는 HTTP 통신입니다.

---

## 3. Kafka를 사용하는 경우

Kafka는 "즉시 답이 필요 없는 작업"에 씁니다.

예:

주문 완료.

```
Order Service

주문 저장 완료

↓

주문 완료 이벤트 발행

↓

Kafka

↓

----------------
Payment Service
Notification Service
Statistics Service
```

예:

이벤트:

```
{
  "event":"ORDER_CREATED",
  "orderId":100,
  "userId":20
}
```

Payment Service:

```
ORDER_CREATED 이벤트 받음

결제 진행
```

Notification Service:

```
ORDER_CREATED 이벤트 받음

메일 발송
```

Order Service는:

"결제 완료했는지"

"메일 보냈는지"

기다리지 않습니다.

---

## 4. 언제 API 호출하고 언제 Kafka 쓰냐?

기준은 간단합니다.

### API 호출

"결과가 지금 필요"

예:

```
주문 생성
 |
 |
회원 정보 필요
```

↓

API 호출

---

### Kafka

"나중에 처리해도 됨"

예:

```
주문 완료
 |
 |
메일 보내기
통계 업데이트
쿠폰 발급
```

↓

Kafka 이벤트

---

## 5. 실제 프로젝트 구조 예

```
msa-project

├── gateway-service
│       Spring Boot
│
├── user-service
│       Spring Boot
│       User DB
│
├── order-service
│       Spring Boot
│       Order DB
│
├── payment-service
│       Spring Boot
│       Payment DB
│
└── docker-compose.yml
        |
        ├── mysql
        ├── kafka
        └── redis
```

각 서비스는:

- 별도 Git 저장소
- 별도 배포
- 별도 DB
- 별도 장애 영역

이 되는 게 이상적인 형태입니다.

---

## 6. 처음 구현한다면 이렇게 해보는 게 좋습니다

처음부터 Kafka, Kubernetes까지 가면 복잡합니다.

추천 실습:

### Step 1

Spring Boot 3개 만들기

```
user-service
order-service
gateway-service
```

---

### Step 2

User API 만들기

```
GET /users/{id}
```

---

### Step 3

Order Service에서 호출

```
Order → User API 호출
```

---

### Step 4

DB 분리

```
user-db
order-db
```

---

### Step 5

Kafka 추가

```
Order 생성

↓

Kafka

↓

Notification Service
```

---

### Step 6

Docker Compose로 같이 실행

```
docker-compose up
```

---

정리하면:

- **Spring 여러 개 실행** → 맞음
- **서비스끼리 REST/gRPC 호출** → 맞음
- **이벤트 기반 처리는 Kafka** → 맞음
- **각 서비스가 자기 DB를 가지는 것** → 중요
- **Gateway가 외부 요청을 관리** → 일반적

처음 MSA 구현이라면 "User Service + Order Service + Kafka 이벤트 1개" 정도를 직접 만들어보는 게 가장 좋은 시작입니다.

카프카의 역할은 뭐야 결국에?  
  
작업 큐 같은 느낌인가?

네, **작업 큐와 비슷한 역할을 하는 부분이 있지만, Kafka를 단순한 작업 큐라고 보면 부족합니다.**

더 정확히 말하면 Kafka는:

> **서비스 간에 "이벤트(사실)"를 전달하고 저장하는 분산 메시지 스트리밍 플랫폼**

입니다.

---

## 1. 작업 큐처럼 쓰는 경우

일반적인 작업 큐는:

```
Producer
   |
   | 작업 등록
   ↓
 Queue
   |
   ↓
Worker
   |
   ↓
처리 완료
```

예:

- 이미지 변환
- 이메일 발송
- 파일 처리

Kafka도 비슷하게:

```
Order Service

"주문 생성됨"

      ↓

Kafka Topic

      ↓

Email Service

"메일 발송"
```

처럼 사용할 수 있습니다.

---

## 2. 그런데 Kafka가 일반 Queue와 다른 점

### 1) 메시지를 삭제하지 않는다

일반 Queue:

```
Queue

A
B
C

Worker가 B 처리

A
C
```

처리하면 보통 제거됩니다.

Kafka:

```
Topic

A
B
C

Consumer 읽음

A
B
C  ← 그대로 있음
```

Kafka는 일정 기간 동안 데이터를 보관합니다.

예:

```
order-events topic

10:00 주문1
10:01 주문2
10:02 주문3

(7일 보관)
```

---

### 2) 여러 서비스가 같은 이벤트를 받을 수 있음

이게 MSA에서 굉장히 중요합니다.

예:

주문 생성:

```
Order Service

      ↓

ORDER_CREATED 이벤트

      ↓ Kafka


------------------------
|          |             |
Payment   Mail       Point
Service   Service    Service
```

각 서비스가 같은 이벤트를 독립적으로 소비합니다.

일반 Queue라면:

```
Queue

ORDER_CREATED

     ↓

Payment가 가져감

끝
```

다른 서비스는 못 봅니다.

---

### 3) 순서를 보장한다

Kafka는 Partition 기준으로 순서를 보장합니다.

예:

```
userId=100

주문 생성
   ↓
결제 완료
   ↓
배송 시작
```

같은 키로 보내면 순서 유지가 가능합니다.

---

## 3. MSA에서 Kafka가 해결하는 문제

예를 들어 주문 시스템:

### Kafka 없이

```
Order Service

주문 생성

 |
 |
 +--> Payment Service 호출
 |
 +--> Coupon Service 호출
 |
 +--> Notification Service 호출
 |
 +--> Point Service 호출
```

문제:

- 결합도가 높음
- 하나 장애 나면 전체 영향
- 서비스 추가할 때 Order 수정 필요

---

### Kafka 사용

```
Order Service

주문 생성

 |
 |
Kafka
 |
 |
 -----------------------
 |        |       |
Payment Coupon Notification
```

Order Service는:

"주문 생성했다"

까지만 알립니다.

누가 처리하는지는 모릅니다.

---

## 4. Kafka를 쓰면 좋은 상황

### 좋은 예

✅ 주문 완료 이벤트

```
ORDER_CREATED
```

받는 곳:

- 결제
- 알림
- 포인트
- 통계

---

✅ 로그 수집

```
Application

↓

Kafka

↓

ELK / Data Warehouse
```

---

✅ 데이터 동기화

```
회원 서비스

회원 변경 이벤트

↓

검색 서비스
```

---

## 5. Kafka를 쓰면 안 좋은 상황

즉시 결과가 필요한 경우:

예:

```
주문 생성

"재고 있나요?"
```

이건 Kafka보다 API 호출이 적합합니다.

왜냐하면:

```
주문
 |
Kafka
 |
재고 확인
 |
(언제 처리될지 모름)
```

사용자가 기다려야 하기 때문입니다.

---

## 6. MSA에서 보통 조합은 이렇게 갑니다

```
                 Gateway

                    |
        ------------------------
        |                      |
   Order Service          User Service
        |
        |
   REST API
        |
   User 확인


주문 완료

        |
        |
      Kafka
        |
 ----------------------
 |          |          |
Payment   Mail      Point
```

즉:

- **API 호출 = 지금 답이 필요함**
- **Kafka = 이벤트를 알리고 나중에 처리**

라고 이해하면 거의 맞습니다.

MSA 처음 배울 때 Kafka를 "비동기 API 호출"처럼 생각하면 이해가 빠릅니다. 다만 차이는 **호출 대상이 없어도 이벤트를 발행할 수 있고, 여러 소비자가 같은 이벤트를 각자 처리할 수 있다**는 점입니다.