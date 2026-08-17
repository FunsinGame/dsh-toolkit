# Conversation turn navigator implementation plan

English | [中文](2026-08-12-conversation-turn-navigator.zh.md)

## Goal

Add an optional Web UI plugin that helps a developer orient and move through a long DSH conversation without changing the session log or the agent loop.

## Scope

Create `@deepseek-ai/dsh-turn-navigator` as a standalone browser-only plugin in its own package. The DSH chat view declares one session-scoped single slot and renders it beside the existing message flow. The plugin derives one marker per settled regular user message, hides below three markers, highlights the current visible turn as the user scrolls, previews a turn on hover or keyboard focus, and scrolls directly to a selected turn.

The change includes light/dark token styling, reduced-motion behavior, localized Chinese and English labels, component and plugin tests, one assembled Web compatibility test, an external bundle patch, package documentation, and a Harness feature Agent Note for the slot contract. It does not add persistence, a new host API, a new session event, or behavior to non-chat views.

## Verification

Run the new package tests, affected ui-conversation tests, the client type program, the plugin bundle, GUI checks, the keyless assembled Web scenario, documentation gates, and diff checks. Report the actual commands and keep unrelated dirty-worktree changes outside the implementation assessment.
