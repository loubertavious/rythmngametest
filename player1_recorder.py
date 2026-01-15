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
    'PORT': 12345,
}

# Colors
COLORS = {
    'BACKGROUND': (30, 30, 50),
    'LANE_DIVIDER': (100, 100, 120),
    'HIT_LINE': (0, 255, 0),
    'NOTE_RECORDING': (78, 205, 196),
    'TEXT': (255, 255, 255),
    'BUTTON': (76, 175, 80),
    'BUTTON_HOVER': (69, 160, 73),
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

class Player1Recorder:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((CONFIG['CANVAS_WIDTH'], CONFIG['CANVAS_HEIGHT']))
        pygame.display.set_caption("Rhythm Game - Player 1 (Recording)")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        self.mode = 'idle'  # 'idle', 'recording', 'sending'
        self.recorded_notes = []
        self.start_time = 0
        self.lane_width = CONFIG['CANVAS_WIDTH'] / CONFIG['LANES']
        
        # Network setup
        self.server_socket = None
        self.client_socket = None
        self.connected = False
        
        # Buttons
        button_y = 50
        button_spacing = 60
        self.start_btn = Button(50, button_y, 150, 40, "Start Recording", self.start_recording)
        self.stop_btn = Button(220, button_y, 150, 40, "Stop", self.stop_recording)
        self.send_btn = Button(390, button_y, 150, 40, "Send to Player 2", self.send_to_player2)
        self.reset_btn = Button(560, button_y, 150, 40, "Reset", self.reset)
        
        self.stop_btn.enabled = False
        self.send_btn.enabled = False
        
        # Get local IP address
        self.local_ip = self.get_local_ip()
        
        # Start server
        self.start_server()
    
    def get_local_ip(self):
        """Get local IP address"""
        try:
            # Connect to a remote address to determine local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "localhost"
    
    def start_server(self):
        """Start server to listen for Player 2 connection"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind(('0.0.0.0', CONFIG['PORT']))
            self.server_socket.listen(1)
            self.server_socket.settimeout(0.1)  # Non-blocking
            
            # Start thread to accept connections
            threading.Thread(target=self.accept_connection, daemon=True).start()
        except Exception as e:
            print(f"Error starting server: {e}")
    
    def accept_connection(self):
        """Accept connection from Player 2"""
        while not self.connected:
            try:
                client, addr = self.server_socket.accept()
                self.client_socket = client
                self.connected = True
                print(f"Player 2 connected from {addr}")
            except socket.timeout:
                continue
            except Exception as e:
                print(f"Error accepting connection: {e}")
                break
    
    def start_recording(self):
        self.mode = 'recording'
        self.recorded_notes = []
        self.start_time = pygame.time.get_ticks()
        
        self.start_btn.enabled = False
        self.stop_btn.enabled = True
        self.send_btn.enabled = False
    
    def record_note(self, lane):
        timestamp = pygame.time.get_ticks() - self.start_time
        self.recorded_notes.append({
            'lane': lane,
            'timestamp': timestamp,
        })
    
    def stop_recording(self):
        if self.mode != 'recording':
            return
        
        self.mode = 'idle'
        self.start_btn.enabled = True
        self.stop_btn.enabled = False
        self.send_btn.enabled = len(self.recorded_notes) > 0
    
    def send_to_player2(self):
        if not self.connected or not self.client_socket:
            print("Player 2 not connected!")
            return
        
        if len(self.recorded_notes) == 0:
            return
        
        try:
            data = json.dumps({
                'type': 'notes',
                'notes': self.recorded_notes
            }) + '\n'
            self.client_socket.send(data.encode())
            print(f"Sent {len(self.recorded_notes)} notes to Player 2")
            self.send_btn.enabled = False
        except Exception as e:
            print(f"Error sending data: {e}")
    
    def reset(self):
        self.mode = 'idle'
        self.recorded_notes = []
        self.start_btn.enabled = True
        self.stop_btn.enabled = False
        self.send_btn.enabled = False
    
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
        if self.mode != 'recording':
            return
        
        current_time = pygame.time.get_ticks() - self.start_time
        travel_time = CONFIG['HIT_LINE_Y'] / CONFIG['NOTE_SPEED']
        
        for note in self.recorded_notes:
            note_appear_time = note['timestamp'] - travel_time
            if current_time < note_appear_time:
                continue
            
            time_since_appear = current_time - note_appear_time
            y = time_since_appear * CONFIG['NOTE_SPEED']
            
            if -CONFIG['NOTE_HEIGHT'] < y < CONFIG['CANVAS_HEIGHT']:
                x = note['lane'] * self.lane_width
                width = self.lane_width - 4
                pygame.draw.rect(self.screen, COLORS['NOTE_RECORDING'], 
                               (x + 2, y, width, CONFIG['NOTE_HEIGHT']))
                pygame.draw.rect(self.screen, (255, 255, 255), 
                               (x + 2, y, width, CONFIG['NOTE_HEIGHT']), 2)
    
    def draw_lane_keys(self):
        keys = ['←', '↓', '↑', '→']
        for i in range(CONFIG['LANES']):
            x = i * self.lane_width + self.lane_width / 2
            y = CONFIG['CANVAS_HEIGHT'] - 40
            
            key_text = self.font.render(keys[i], True, COLORS['TEXT'])
            key_rect = key_text.get_rect(center=(x, y))
            self.screen.blit(key_text, key_rect)
    
    def draw_info(self):
        y_offset = 100
        info_texts = [
            f"Mode: {self.mode.upper()}",
            f"Notes Recorded: {len(self.recorded_notes)}",
            f"Status: {'Connected' if self.connected else 'Waiting for Player 2...'}",
            f"IP Address: {self.local_ip}",
            f"Port: {CONFIG['PORT']}",
        ]
        
        for i, text in enumerate(info_texts):
            surface = self.small_font.render(text, True, COLORS['TEXT'])
            self.screen.blit(surface, (50, y_offset + i * 25))
    
    def run(self):
        running = True
        
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                
                # Handle button clicks
                self.start_btn.handle_event(event)
                self.stop_btn.handle_event(event)
                self.send_btn.handle_event(event)
                self.reset_btn.handle_event(event)
                
                # Handle key presses
                if event.type == pygame.KEYDOWN:
                    if event.key in KEY_MAP and self.mode == 'recording':
                        self.record_note(KEY_MAP[event.key])
            
            # Draw everything
            self.screen.fill(COLORS['BACKGROUND'])
            
            self.draw_lanes()
            self.draw_hit_line()
            self.draw_notes()
            self.draw_lane_keys()
            self.draw_info()
            
            # Draw buttons
            self.start_btn.draw(self.screen, self.font)
            self.stop_btn.draw(self.screen, self.font)
            self.send_btn.draw(self.screen, self.font)
            self.reset_btn.draw(self.screen, self.font)
            
            pygame.display.flip()
            self.clock.tick(60)
        
        pygame.quit()

if __name__ == "__main__":
    game = Player1Recorder()
    game.run()
