from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from datetime import datetime
import uuid
import os

app = Flask(__name__)
app.config["SECRET_KEY"] = "change-this-secret"
socketio = SocketIO(app, cors_allowed_origins="*")

bots = {}
orders = {}
inventory = {}

def now():
    return datetime.now().isoformat(timespec="seconds")

def log(message, bot_id=None):
    socketio.emit("log", {"time": now(), "bot_id": bot_id, "message": message})

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/state")
def state():
    return jsonify({
        "bots": list(bots.values()),
        "inventory": inventory,
        "orders": list(orders.values())
    })

@app.post("/api/orders")
def create_order():
    data = request.json or {}
    required = ["bot_id", "target_user", "item", "quantity"]
    if any(not data.get(k) for k in required):
        return jsonify({"error": "Faltan campos"}), 400

    order_id = "ORD-" + uuid.uuid4().hex[:8].upper()
    order = {
        "id": order_id,
        "bot_id": data["bot_id"],
        "target_user": data["target_user"],
        "item": data["item"],
        "quantity": int(data["quantity"]),
        "status": "PENDING",
        "created_at": now()
    }
    orders[order_id] = order

    socketio.emit("command", {
        "type": "TRADE_REQUEST",
        "request_id": order_id,
        "payload": {
            "target_user": order["target_user"],
            "item": order["item"],
            "quantity": order["quantity"]
        }
    }, room=order["bot_id"])

    log(f"Nueva orden {order_id} para {order['target_user']}", order["bot_id"])
    socketio.emit("order_update", order)
    return jsonify(order)

@app.post("/api/orders/<order_id>/confirm")
def confirm(order_id):
    order = orders.get(order_id)
    if not order:
        return jsonify({"error": "Orden no encontrada"}), 404
    order["status"] = "CONFIRMED_BY_ADMIN"
    socketio.emit("command", {
        "type": "TRADE_CONFIRM",
        "request_id": order_id
    }, room=order["bot_id"])
    socketio.emit("order_update", order)
    log(f"Orden {order_id} confirmada manualmente", order["bot_id"])
    return jsonify(order)

@app.post("/api/orders/<order_id>/cancel")
def cancel(order_id):
    order = orders.get(order_id)
    if not order:
        return jsonify({"error": "Orden no encontrada"}), 404
    order["status"] = "CANCELLED"
    socketio.emit("command", {
        "type": "TRADE_CANCEL",
        "request_id": order_id
    }, room=order["bot_id"])
    socketio.emit("order_update", order)
    log(f"Orden {order_id} cancelada", order["bot_id"])
    return jsonify(order)

@socketio.on("bot_register")
def bot_register(data):
    bot_id = data["bot_id"]
    bots[bot_id] = {
        "id": bot_id,
        "name": data.get("name", bot_id),
        "status": "ONLINE",
        "account_name": data.get("account_name", "DemoAccount"),
        "last_seen": now()
    }
    inventory.setdefault(bot_id, [])
    from flask_socketio import join_room
    join_room(bot_id)
    emit("registered", {"bot_id": bot_id})
    socketio.emit("state_update", {"bots": list(bots.values()), "inventory": inventory})
    log("Bot conectado", bot_id)

@socketio.on("bot_status")
def bot_status(data):
    bot_id = data["bot_id"]
    if bot_id in bots:
        bots[bot_id]["status"] = data.get("status", "ONLINE")
        bots[bot_id]["last_seen"] = now()
        socketio.emit("state_update", {"bots": list(bots.values()), "inventory": inventory})

@socketio.on("inventory_result")
def inventory_result(data):
    bot_id = data["bot_id"]
    inventory[bot_id] = data.get("items", [])
    if bot_id in bots:
        bots[bot_id]["last_inventory_sync"] = now()
    socketio.emit("state_update", {"bots": list(bots.values()), "inventory": inventory})
    log(f"Inventario recibido: {len(inventory[bot_id])} elementos", bot_id)

@socketio.on("trade_status")
def trade_status(data):
    order_id = data["request_id"]
    if order_id in orders:
        orders[order_id]["status"] = data["status"]
        socketio.emit("order_update", orders[order_id])
        log(f"{order_id}: {data['status']}", orders[order_id]["bot_id"])

if __name__ == "__main__":
    print("Panel: http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "5000")), allow_unsafe_werkzeug=True)
