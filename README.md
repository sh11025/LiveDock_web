# 📺 LiveDock Web

> **치지직(CHZZK) · SOOP · 유튜브(YouTube)** 실시간 스트리밍 서버 상태 및 지연시간(Latency) 모니터링 웹 서비스

[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🌟 주요 기능

- **실시간 3대 플랫폼 모니터링**: 치지직, SOOP, 유튜브 서버 응답 속도(ms) 및 HTTP 상태 실시간 추적
- **모바일 최적화 (PWA)**: 스마트폰 홈 화면 추가 시 전체화면 앱 구동, 한 손 조작 퀵 액션바 제공
- **화면 켜짐 유지 (Wake Lock)**: 모니터링 중 스마트폰 화면 꺼짐 자동 방지
- **복합 알림**: 서버 지연 및 장애 감지 시 사운드, 진동(햅틱), 브라우저 푸시 알림

---

## 📁 프로젝트 구조

```text
├── api/            # Vercel Serverless Function (백엔드 프록시 헬스체크)
├── public/         # 프론트엔드 정적 파일 (HTML, CSS, JS)
├── local_dev.js    # 로컬 테스트용 경량 웹서버
└── vercel.json     # Vercel 라우팅 설정
```
