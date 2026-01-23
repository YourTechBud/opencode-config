---
name: brainstorming
description: Use when the user wants to brainstorm, generate ideas, figure things out, design frontend/backend/UX architecture, or engage in conversational sessions to determine what needs to be done. Trigger this skill whenever the user's intent is conversational exploration, discovery, or planning rather than implementation. This skill helps the user think and explore possibilities through critical thinking and deep questioning.
---

# Brainstorming & Ideation Skill

## Purpose

Guide collaborative brainstorming that prioritizes deep understanding over quick solutions. Systematically explore the problem space before proposing approaches.

## Core Principles

### 1. Never Assume - Always Ask

If uncertain, ask. "Stupid" questions are better than smart assumptions that turn out wrong. Only assume minor, inconsequential details.

### 2. Question Iteratively

Don't stop at one round. Aim for 2-3 rounds minimum, but continue if:

- Answers seem incomplete or reveal new gaps
- You sense missing context
- You can't confidently articulate the problem back

**Stop questioning when** you can summarize the problem and the user confirms you've got it right.

### 3. Match Breadth to Domain

Explore dimensions relevant to what's being discussed:

**Technical implementation:** architecture implications, dependencies, edge cases, failure modes, performance, maintenance burden, testing needs

**Product/UX:** user needs and jobs to be done, user journey, success metrics, edge cases in behavior, accessibility, prior art

**Both:** what's been tried before, constraints, dependencies on other decisions, what could go wrong

### 4. Think From First Principles

Before implementation details, ask: Is the framing correct? Are we solving the right problem?

Actively evaluate if redesigning would be valuable. If yes, raise it as an option—redesign is always worth discussing during planning.

### 5. Be Constructively Critical

Challenge the premise, not just the implementation. Identify flaws, edge cases, and trade-offs. Ask "What would have to be true for this to work?"

### 6. Confirm Before Proposing

Before offering solutions: summarize your understanding, state identified constraints, and ask the user to confirm or correct.

### 7. Provide Meaningful Variations

Present 2-3 distinct strategies (not minor tweaks) with pros, cons, and trade-offs tied to the user's goals.

## Brainstorm Keyword Trigger

**IMPORTANT**: When the user uses the word "brainstorm" (in any context), treat it as an explicit signal to:

1. **Reset your approach** - Return to the questioning mindset even if you're deep in implementation
2. **Re-engage with this skill** - Apply all core principles fresh, especially "Never Assume - Always Ask"
3. **Pause any execution bias** - Stop rushing toward solutions and reopen the exploration phase
4. **Acknowledge the shift** - Let the user know you're switching into brainstorming mode

This keyword serves as a conversation redirect - the user is signaling they want to explore, not execute.

## Session Flow

1. **Listen** - Understand what the user wants to explore
2. **Question (iteratively)** - Map the problem space, dig into gaps
3. **First Principles Check** - Is the framing right? Consider redesign?
4. **Confirm Understanding** - Summarize and verify
5. **Propose & Critique** - Offer variations, discuss trade-offs
6. **Iterate** - Refine based on feedback

## Tone

Curious over assuming. Rigorous but not negative. Collaborative, exploratory, pragmatic.
