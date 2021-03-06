const express = require("express");
const router = express.Router();
const db = require("./db");
const axios = require("axios");
const _ = require("lodash");
const config = require("./config.json");

router.get("/", async (req, res) => {
  res.json({ api: "ok" });
});

router.get("/txs", async (req, res) => {
  const blockchain = req.query.blockchain;
  let data;
  if (blockchain) {
    const query =
      "select * from txs where blockchain = $1 order by height desc";
    data = (await db.query(query, [blockchain])).rows;
  } else {
    const query = "select * from txs order by height desc";
    data = (await db.query(query)).rows;
  }
  res.json(data);
});

router.get("/txs/ibc", async (req, res) => {
  let data = [];
  const txs = (await db.query("select * from txs")).rows;
  txs.forEach((tx) => {
    Object.keys(tx.events).forEach((i) => {
      const ev = tx.events[i];
      if (ev.type === "recv_packet") {
        const packet_data = _.find(ev.attributes, { key: "packet_data" });
        const addr = JSON.parse(packet_data.val).value.receiver;
        data.push(tx);
      }
      if (ev.type === "send_packet") {
        const packet_data = _.find(ev.attributes, { key: "packet_data" });
        const addr = JSON.parse(packet_data.val).value.sender;
        data.push(tx);
      }
    });
  });
  res.json(data);
});

router.get("/transfers", async (req, res) => {
  const data = (await db.query("select * from transfers")).rows;
  res.json(data);
});

router.get("/transfers/connections", async (req, res) => {
  let connections = {};
  const txs = (await db.query("select * from transfers")).rows;
  txs.forEach((tx) => {
    if (tx.type === "send_packet") {
      const pair = `${tx.sender}-${tx.receiver}`;
      if (pair in connections) {
        connections[pair]++;
      } else {
        connections[pair] = 1;
      }
    }
  });
  connections = Object.keys(connections).map((pair) => {
    const [sender, receiver] = pair.split("-");
    const count = connections[pair];
    return { sender, receiver, count };
  });
  res.json(connections);
});

router.get("/blockchains", async (req, res) => {
  res.json(config.blockchains);
});

router.get("/relations", async (req, res) => {
  let data = {};
  const txs = (await db.query("select * from transfers")).rows;
  txs.forEach((tx) => {
    if (tx.type === "send_packet") {
      data[tx.sender] = tx.blockchain;
    }
    if (tx.type === "recv_packet") {
      data[tx.receiver] = tx.blockchain;
    }
  });
  res.json(data);
});

router.get("/ranking", async (req, res) => {
  let data = {};
  const txs = (await db.query("select * from transfers")).rows;
  txs.forEach((tx) => {
    const empty = { outgoing: 0, incoming: 0, blockchain: tx.blockchain };
    data[tx.blockchain] = data[tx.blockchain] || empty;
    if (tx.type === "send_packet") {
      data[tx.blockchain].outgoing++;
    }
    if (tx.type === "recv_packet") {
      data[tx.blockchain].incoming++;
    }
  });
  res.json(Object.values(data));
});

router.get("/health", async (req, res) => {
  const blockchain = req.query.blockchain;
  let data;
  try {
    data = (await axios.get(`http://${blockchain}:26657/health`)).data;
    res.send(data);
  } catch {
    data = null;
    res.sendStatus(404);
  }
});

module.exports = router;
