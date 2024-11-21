const fs = require("fs");
const colors = require("colors");
const { DateTime } = require("luxon");
const path = require("path");

require("dotenv").config();

function _isArray(obj) {
  if (Array.isArray(obj) && obj.length > 0) {
    return true;
  }

  try {
    const parsedObj = JSON.parse(obj);
    return Array.isArray(parsedObj) && parsedObj.length > 0;
  } catch (e) {
    return false;
  }
}

// Hàm để ghi đè biến môi trường
const envFilePath = path.join(__dirname, ".env");
function updateEnv(variable, value) {
  // Đọc file .env
  fs.readFile(envFilePath, "utf8", (err, data) => {
    if (err) {
      console.log("Unable to read .env file:", err);
      return;
    }
    // Tạo hoặc cập nhật biến trong file
    const regex = new RegExp(`^${variable}=.*`, "m");
    const newData = data.replace(regex, `${variable}=${value}`);

    // Kiểm tra nếu biến không tồn tại trong file, thêm vào cuối
    if (!regex.test(data)) {
      newData += `\n${variable}=${value}`;
    }

    // Ghi lại file .env
    fs.writeFile(envFilePath, newData, "utf8", (err) => {
      if (err) {
        console.error("Unable to write .env file:", err);
      } else {
        console.log(`Updated ${variable} to ${value}`);
      }
    });
  });
}

function sleep(seconds = null) {
  if (seconds && typeof seconds === "number") return new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  let DELAY_BETWEEN_REQUESTS = process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5];
  if (seconds && Array.isArray(seconds)) {
    DELAY_BETWEEN_REQUESTS = seconds;
  }
  min = DELAY_BETWEEN_REQUESTS[0];
  max = DELAY_BETWEEN_REQUESTS[1];

  return new Promise((resolve) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay * 1000);
  });
}

function saveToken(id, token) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  tokens[id] = token;
  fs.writeFileSync("token.json", JSON.stringify(tokens, null, 4));
}

function getToken(id) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  return tokens[id] || null;
}

function isExpiredToken(token) {
  const [header, payload, sign] = token.split(".");
  const decodedPayload = Buffer.from(payload, "base64").toString();

  try {
    const parsedPayload = JSON.parse(decodedPayload);
    const now = Math.floor(DateTime.now().toSeconds());

    if (parsedPayload.exp) {
      const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
      this.log(colors.cyan(`Token expires on: ${expirationDate.toFormat("yyyy-MM-dd HH:mm:ss")}`));
      const isExpired = now > parsedPayload.exp;
      this.log(colors.cyan(`Has the token expired? ${isExpired ? "That's right, you need to change the token" : "No..go full throttle"}`));
      return isExpired;
    } else {
      this.log(colors.yellow(`Perpetual tokens have unreadable expiration times`));
      return false;
    }
  } catch (error) {
    this.error(colors.red(`Error:${error.message}`));
    return true;
  }
}

function generateRandomHash() {
  const characters = "0123456789abcdef";
  let hash = "0x"; // Bắt đầu bằng "0x"

  for (let i = 0; i < 64; i++) {
    // 64 ký tự cho hash
    const randomIndex = Math.floor(Math.random() * characters.length);
    hash += characters[randomIndex];
  }

  return hash;
}

function getRandomElement(arr) {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function loadData(file) {
  try {
    const datas = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
    if (datas?.length <= 0) {
      console.log(colors.red(`No data found ${file}`));
      process.exit();
    }
    return datas;
  } catch (error) {
    console.log(`File not found ${file}`.red);
  }
}

async function saveData(data, filename) {
  fs.writeFileSync(filename, data.join("\n"));
}

function log(msg, type = "info") {
  switch (type) {
    case "success":
      console.log(`[*] ${msg}`.green);
      break;
    case "custom":
      console.log(`[*] ${msg}`.magenta);
      break;
    case "error":
      console.log(`[!] ${msg}`.red);
      break;
    case "warning":
      console.log(`[*] ${msg}`.yellow);
      break;
    default:
      console.log(`[*] ${msg}`.blue);
  }
}

function saveItem(id, value, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  data[id] = value;
  fs.writeFileSync(filename, JSON.stringify(data, null, 4));
}

function getItem(id, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  return data[id] || null;
}

function getOrCreateJSON(id, value, filename) {
  let item = getItem(id, filename);
  if (item) {
    return item;
  }
  item = saveItem(id, value, filename);
  return item;
}

module.exports = { _isArray, getRandomNumber, updateEnv, saveToken, getToken, isExpiredToken, generateRandomHash, getRandomElement, loadData, saveData, log, getOrCreateJSON, sleep };
