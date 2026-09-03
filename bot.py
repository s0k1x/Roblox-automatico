import argparse
import socketio
import time

parser = argparse.ArgumentParser()
parser.add_argument("--name", default="BOT-001")
parser.add_argument("--url", default="http://127.0.0.1:5000")
args = parser.parse_args()

sio = socketio.Client(reconnection=True)

BOT_ID = args.name

@sio.event
def connect():
    print("Conectado al servidor")
    sio.emit("bot_register", {
        "bot_id": BOT_ID,
        "name": BOT_ID,
        "account_name": "DemoAccount"
    })

@sio.event
def disconnect():
    print("Desconectado")

@sio.on("command")
def command(data):
    print("Orden recibida:", data)
    command_type = data.get("type")

    if command_type == "TRADE_REQUEST":
        request_id = data["request_id"]
        # Prototipo: prepara la orden, pero NO ejecuta ningún trade real.
        sio.emit("trade_status", {
            "request_id": request_id,
            "status": "WAITING_CONFIRMATION"
        })

    elif command_type == "TRADE_CONFIRM":
        # Prototipo: solamente registra la confirmación.
        sio.emit("trade_status", {
            "request_id": data["request_id"],
            "status": "CONFIRMED"
        })

    elif command_type == "TRADE_CANCEL":
        sio.emit("trade_status", {
            "request_id": data["request_id"],
            "status": "CANCELLED"
        })

def demo_inventory():
    return [
        {"name": "Unicorn", "type": "Pet", "rarity": "Legendary", "quantity": 2},
        {"name": "Dog", "type": "Pet", "rarity": "Common", "quantity": 5},
        {"name": "Ride Potion", "type": "Potion", "rarity": "Potion", "quantity": 1}
    ]

sio.connect(args.url)
sio.emit("inventory_result", {"bot_id": BOT_ID, "items": demo_inventory()})
sio.emit("bot_status", {"bot_id": BOT_ID, "status": "IN_ADOPT_ME"})

while True:
    sio.emit("bot_status", {"bot_id": BOT_ID, "status": "IN_ADOPT_ME"})
    time.sleep(15)
