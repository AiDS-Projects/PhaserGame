import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Single entry point: build the game immediately (no DOMContentLoaded wrapper).
new Phaser.Game(gameConfig);