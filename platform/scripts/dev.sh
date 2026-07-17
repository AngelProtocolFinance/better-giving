#!/usr/bin/env bash
mprocs \
  --names "dev,ngrok,qstash" \
  "pnpm --filter better-giving exec react-router dev" \
  "ngrok http --url skink-driving-imp.ngrok-free.app 4200" \
  "pnpm dlx @upstash/qstash-cli dev"
