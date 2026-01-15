# Rhythm Game - Split Screen Version

A rhythm game inspired by osu!mania and Guitar Hero, where one player records a rhythm pattern and another player tries to match it. Built with JavaScript/HTML5 Canvas, featuring a split-screen interface.

## Features

- **Split-Screen Interface**: Both players visible on the same screen
- **Two Player Mode**: Player 1 records, Player 2 plays back
- **4-Lane Gameplay**: 
  - Player 1 uses ASDF keys
  - Player 2 uses HJKL keys
- **Scoring System**: Points based on timing accuracy with combo multipliers
- **Visual Feedback**: Real-time hit indicators and visual effects
- **Sound Effects**: Audio feedback for recording, hits, and misses
- **Modern UI**: Beautiful gradient design with smooth animations

## Quick Start

Simply open `split_screen.html` in a modern web browser. No installation required!

## How to Play

### Player 1 - Recording (Left Side)
1. Click "Start Recording"
2. Press ASDF keys to create your rhythm pattern
3. Click "Stop" when finished
4. Click "Send to Player 2" to transmit your pattern

### Player 2 - Playback (Right Side)
1. Wait for Player 1 to send notes
2. Click "Start Playback"
3. Watch the notes scroll down from the top
4. Press HJKL keys when notes reach the green hit line
5. Match the rhythm to score points!

## Controls

### Player 1 (Recording)
- **A**: Lane 1 (Left)
- **S**: Lane 2 (Down)
- **D**: Lane 3 (Up)
- **F**: Lane 4 (Right)

### Player 2 (Playback)
- **H**: Lane 1 (Left)
- **J**: Lane 2 (Down)
- **K**: Lane 3 (Up)
- **L**: Lane 4 (Right)

## Scoring

- **Perfect Hit** (within 50ms): 100 points
- **Good Hit** (within 150ms): 50 points
- **Combo Multiplier**: Score increases with consecutive hits
- **Accuracy**: Percentage of notes hit correctly

## Files

- `split_screen.html` - Main HTML file with split-screen layout
- `split_screen.js` - Game logic for both players

## Technical Details

- Pure JavaScript - no frameworks required
- HTML5 Canvas for rendering
- Responsive design that adapts to screen size
- Real-time synchronization between players

Enjoy the rhythm challenge!
