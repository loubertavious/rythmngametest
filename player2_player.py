import pygame
import socket
import json
import threading
import time

# Game Configuration
CONFIG = {
    'LANES': 4,
    'NOTE_SPEED': 0.3,  # pixels per millisecond
    'CANVAS_WIDTH': 800,
    'CANVAS_HEIGHT': 600,
    'HIT_LINE_Y': 550,
    'NOTE_HEIGHT': 30,
    'HIT_WINDOW': 150,  # milliseconds
    'PERFECT_WINDOW': 50,  # milliseconds
    'HOST': 'localhost',  # Change to Player 1's IP address
    'PORT': 12345,
}

# Colors
COLORS = {
    'BACKGROUND': (30, 30, 50),
    'LANE_DIVIDER': (100, 100, 120),
    'HIT_LINE': (0, 255, 0),
    'NOTE_PLAYBACK': (255, 107, 107),
    'NOTE_HIT': (0, 255, 0),
    'TEXT': (255, 255, 255),
    'BUTTON': (33, 150, 243),
    'BUTTON_HOVER': (25, 118, 210),
    'BUTTON_DISABLED': (100, 100, 100),
}

# Key mapping
KEY_MAP = {
    pygame.K_LEFT: 0,
    pygame.K_DOWN: 1,
    pygame.K_UP: 2,
    pygame.K_RIGHT: 3,
}

class Button:
    def __init__(self, x, y, width, height, text, callback):
        self.rect = pygame.Rect(x, y, width, height)
        self.text = text
        self.callback = callback
        self.enabled = True
        self.hover = False
        
    def draw(self, screen, font):
        color = COLORS['BUTTON'] if self.enabled else COLORS['BUTTON_DISABLED']
        if self.hover and self.enabled:
            color = COLORS['BUTTON_HOVER']
        
        pygame.draw.rect(screen, color, self.rect, border_radius=8)
        pygame.draw.rect(screen, (255, 255, 255), self.rect, width=2, border_radius=8)
        
        text_surface = font.render(self.text, True, COLORS['TEXT'])
        text_rect = text_surface.get_rect(center=self.rect.center)
        screen.blit(text_surface, text_rect)
    
    def handle_event(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if self.rect.collidepoint(event.pos) and self.enabled:
                self.callback()
                return True
        return False

class Player2Player:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((CONFIG['CANVAS_WIDTH'], CONFIG['CANVAS_HEIGHT']))
        pygame.display.set_caption("Rhythm Game - Player 2 (Playback)")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        self.mode = 'idle'  # 'idle', 'playback'
        self.playback_notes = []
        self.start_time = 0
        self.lane_width = CONFIG['CANVAS_WIDTH'] / CONFIG['LANES']
        
        # Game stats
        self.score = 0
        self.combo = 0
        self.max_combo = 0
        self.hits = 0
        self.misses = 0
        self.total_notes = 0
        
        # Network setup
        self.socket = None
        self.connected = False
        self.receiving = False
        
        # Buttons
        button_y = 50
        self.connect_btn = Button(50, button_y, 200, 40, "Connect to Player 1", self.connect_to_player1)
        self.start_btn = Button(270, button_y, 150, 40, "Start Playback", self.start_playback)
        self.reset_btn = Button(440, button_y, 150, 40, "Reset", self.reset)
        
        self.start_btn.enabled = False
        
        # Lane hit effects
        self.lane_hit_effects = [0] * CONFIG['LANES']  # Time remaining for hit effect
    
    def connect_to_player1(self):
        """Connect to Player 1's server"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((CONFIG['HOST'], CONFIG['PORT']))
            self.connected = True
            self.connect_btn.enabled = False
            print("Connected to Player 1!")
            
            # Start thread to receive data
            threading.Thread(target=self.receive_data, daemon=True).start()
        except Exception as e:
            print(f"Error connecting to Player 1: {e}")
            self.connected = False
    
    def receive_data(self):
        """Receive notes from Player 1"""
        buffer = ""
        while self.connected:
            try:
                data = self.socket.recv(4096).decode()
                if not data:
                    break
                
                buffer += data
                while '\n' in buffer or len(buffer) > 0:
                    try:
                        # Try to parse JSON
                        if '\n' in buffer:
                            line, buffer = buffer.split('\n', 1)
                        else:
                            line = buffer
                            buffer = ""
                        
                        if line:
                            message = json.loads(line)
                            if message['type'] == 'notes':
                                self.playback_notes = [
                                    {**note, 'hit': False, 'missed': False}
                                    for note in message['notes']
                                ]
                                self.total_notes = len(self.playback_notes)
                                self.start_btn.enabled = True
                                print(f"Received {len(self.playback_notes)} notes!")
                    except json.JSONDecodeError:
                        # Not complete JSON yet, wait for more data
                        break
            except Exception as e:
                print(f"Error receiving data: {e}")
                break
    
    def start_playback(self):
        if len(self.playback_notes) == 0:
            return
        
        # Reset all notes
        for note in self.playback_notes:
            note['hit'] = False
            note['missed'] = False
        
        self.mode = 'playback'
        self.start_time = pygame.time.get_ticks()
        self.score = 0
        self.combo = 0
        self.hits = 0
        self.misses = 0
        
        self.start_btn.enabled = False
    
    def check_hit(self, lane):
        if self.mode != 'playback':
            return
        
        current_time = pygame.time.get_ticks() - self.start_time
        
        # Find closest note in this lane
        closest_note = None
        closest_distance = float('inf')
        
        for note in self.playback_notes:
            if note['lane'] != lane or note['hit'] or note['missed']:
                continue
            
            note_time = note['timestamp']
            distance = abs(current_time - note_time)
            
            if distance < closest_distance and distance <= CONFIG['HIT_WINDOW']:
                closest_distance = distance
                closest_note = note
        
        if closest_note:
            self.hit_note(closest_note, closest_distance, lane)
    
    def hit_note(self, note, timing_offset, lane):
        note['hit'] = True
        self.hits += 1
        self.combo += 1
        
        if self.combo > self.max_combo:
            self.max_combo = self.combo
        
        # Scoring
        points = 0
        if timing_offset <= CONFIG['PERFECT_WINDOW']:
            points = 100
        elif timing_offset <= CONFIG['HIT_WINDOW']:
            points = 50
        
        self.score += int(points * (1 + self.combo * 0.1))
        
        # Visual feedback
        self.lane_hit_effects[lane] = 10  # Frames to show effect
    
    def miss_note(self, note):
        note['missed'] = True
        self.misses += 1
        self.combo = 0
    
    def draw_lanes(self):
        for i in range(CONFIG['LANES'] + 1):
            x = i * self.lane_width
            pygame.draw.line(self.screen, COLORS['LANE_DIVIDER'], 
                           (x, 0), (x, CONFIG['CANVAS_HEIGHT']), 2)
    
    def draw_hit_line(self):
        pygame.draw.line(self.screen, COLORS['HIT_LINE'], 
                        (0, CONFIG['HIT_LINE_Y']), 
                        (CONFIG['CANVAS_WIDTH'], CONFIG['HIT_LINE_Y']), 3)
    
    def draw_notes(self):
        if self.mode != 'playback':
            return
        
        current_time = pygame.time.get_ticks() - self.start_time
        travel_time = CONFIG['HIT_LINE_Y'] / CONFIG['NOTE_SPEED']
        
        for note in self.playback_notes:
            if note['hit'] or note['missed']:
                continue
            
            note_appear_time = note['timestamp'] - travel_time
            if current_time < note_appear_time:
                continue
            
            time_since_appear = current_time - note_appear_time
            y = time_since_appear * CONFIG['NOTE_SPEED']
            
            # Check if missed
            if y > CONFIG['HIT_LINE_Y'] + 50:
                self.miss_note(note)
                continue
            
            if -CONFIG['NOTE_HEIGHT'] < y < CONFIG['CANVAS_HEIGHT']:
                color = COLORS['NOTE_HIT'] if note['hit'] else COLORS['NOTE_PLAYBACK']
                x = note['lane'] * self.lane_width
                width = self.lane_width - 4
                pygame.draw.rect(self.screen, color, 
                               (x + 2, y, width, CONFIG['NOTE_HEIGHT']))
                pygame.draw.rect(self.screen, (255, 255, 255), 
                               (x + 2, y, width, CONFIG['NOTE_HEIGHT']), 2)
    
    def draw_lane_keys(self):
        keys = ['←', '↓', '↑', '→']
        for i in range(CONFIG['LANES']):
            x = i * self.lane_width + self.lane_width / 2
            y = CONFIG['CANVAS_HEIGHT'] - 40
            
            # Draw hit effect
            if self.lane_hit_effects[i] > 0:
                pygame.draw.rect(self.screen, (0, 255, 0, 100),
                               (i * self.lane_width, CONFIG['HIT_LINE_Y'] - 5,
                                self.lane_width, 10))
                self.lane_hit_effects[i] -= 1
            
            key_text = self.font.render(keys[i], True, COLORS['TEXT'])
            key_rect = key_text.get_rect(center=(x, y))
            self.screen.blit(key_text, key_rect)
    
    def draw_info(self):
        y_offset = 100
        accuracy = 100.0
        if self.hits + self.misses > 0:
            accuracy = (self.hits / (self.hits + self.misses)) * 100
        
        info_texts = [
            f"Mode: {self.mode.upper()}",
            f"Score: {self.score}",
            f"Accuracy: {accuracy:.1f}%",
            f"Combo: {self.combo}",
            f"Status: {'Connected' if self.connected else 'Not Connected'}",
        ]
        
        for i, text in enumerate(info_texts):
            surface = self.small_font.render(text, True, COLORS['TEXT'])
            self.screen.blit(surface, (50, y_offset + i * 25))
        
        # Check if playback finished
        if self.mode == 'playback':
            all_processed = all(note['hit'] or note['missed'] for note in self.playback_notes)
            if all_processed:
                final_accuracy = (self.hits / self.total_notes * 100) if self.total_notes > 0 else 0
                finish_text = f"FINISHED! Score: {self.score} | Accuracy: {final_accuracy:.1f}% | Max Combo: {self.max_combo}"
                finish_surface = self.font.render(finish_text, True, (255, 215, 0))
                finish_rect = finish_surface.get_rect(center=(CONFIG['CANVAS_WIDTH']/2, 300))
                self.screen.blit(finish_surface, finish_rect)
                self.mode = 'idle'
                self.start_btn.enabled = True
    
    def reset(self):
        self.mode = 'idle'
        self.playback_notes = []
        self.score = 0
        self.combo = 0
        self.hits = 0
        self.misses = 0
        self.total_notes = 0
        self.start_btn.enabled = False
    
    def run(self):
        running = True
        
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                
                # Handle button clicks
                self.connect_btn.handle_event(event)
                self.start_btn.handle_event(event)
                self.reset_btn.handle_event(event)
                
                # Handle key presses
                if event.type == pygame.KEYDOWN:
                    if event.key in KEY_MAP:
                        self.check_hit(KEY_MAP[event.key])
            
            # Draw everything
            self.screen.fill(COLORS['BACKGROUND'])
            
            self.draw_lanes()
            self.draw_hit_line()
            self.draw_notes()
            self.draw_lane_keys()
            self.draw_info()
            
            # Draw buttons
            self.connect_btn.draw(self.screen, self.font)
            self.start_btn.draw(self.screen, self.font)
            self.reset_btn.draw(self.screen, self.font)
            
            pygame.display.flip()
            self.clock.tick(60)
        
        if self.socket:
            self.socket.close()
        pygame.quit()

if __name__ == "__main__":
    game = Player2Player()
    game.run()
