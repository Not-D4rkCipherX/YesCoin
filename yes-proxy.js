const fs = require("fs");
const axios = require("axios");
const colors = require("colors");
const path = require("path");
const readline = require("readline");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const crypto = require("crypto");
const { parse } = require("querystring");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, getRandomNumber, updateEnv } = require("./utils");

const baseUrl = settings.BASE_URL_API;

class YesCoinBot {
  constructor(accountIndex, account, proxy) {
    this.accountIndex = accountIndex;
    this.account = account;
    this.proxy = proxy;
    this.proxyIP = "Unknown";
    this.token = null;
    this.timeout = 30000;
    this.wallet = null;
    this.baseheaders = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://www.yescoin.gold",
      referer: "https://www.yescoin.gold/",
      "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128", "Microsoft Edge WebView2";v="128"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    };
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.wallets = this.loadWallets();
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.baseheaders["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.baseheaders["sec-ch-ua-platform"] = platform;
    this.baseheaders["User-Agent"] = this.#get_user_agent();
  }

  loadWallets() {
    try {
      const walletFile = path.join(__dirname, "wallets.txt");
      if (fs.existsSync(walletFile)) {
        return fs.readFileSync(walletFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      }
      return [];
    } catch (error) {
      this.log(`Lỗi khi đọc file wallet: ${error.message}`, "error");
      return [];
    }
  }

  createUserAgent() {
    try {
      const telegramauth = this.account;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Error, please update query_id; ${error.message}`);
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }

    console.log(logMessage);
    await this.randomDelay();
  }

  headers(token) {
    return {
      ...this.baseheaders,
      token: token,
    };
  }

  formatLoginPayload(encodedData) {
    const decodedData = decodeURIComponent(encodedData);
    return { code: decodedData };
  }

  async login(encodedData, proxy) {
    const url = `${baseUrl}/user/login`;
    const formattedPayload = this.formatLoginPayload(encodedData);
    const headers = this.baseheaders;
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      const response = await axios.post(url, formattedPayload, {
        headers,
        httpsAgent: proxyAgent,
      });
      if (response.data.code === 0) {
        const token = response.data.data.token;
        return token;
      } else {
        throw new Error(`Login failed: ${response.data.message}`);
      }
    } catch (error) {
      throw new Error(`Login failed:: ${error.message}`);
    }
  }

  async saveToken(id, token) {
    let tokens = {};
    if (fs.existsSync("token.json")) {
      tokens = JSON.parse(fs.readFileSync("token.json", "utf-8"));
    }
    tokens[id] = token;
    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));
  }

  loadToken(id) {
    if (fs.existsSync("token.json")) {
      const tokens = JSON.parse(fs.readFileSync("token.json", "utf-8"));
      return tokens[id];
    }
    return null;
  }

  async getOrRefreshToken(encodedData, proxy) {
    const savedToken = this.loadToken(this.session_name);
    if (savedToken) {
      this.token = savedToken;
      return this.token;
    }

    this.token = await this.login(encodedData, proxy);
    await this.saveToken(this.session_name, this.token);
    return this.token;
  }

  async checkProxyIP(proxy) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      const response = await axios.get("https://api.ipify.org?format=json", {
        httpsAgent: proxyAgent,
      });
      if (response.status === 200) {
        return response.data.ip;
      } else {
        throw new Error(`Unable to check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error when checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(method, url, data = null, token, proxy, extraHeaders = {}) {
    const defaultHeaders = this.headers(token);
    // console.log(defaultHeaders);
    const headers = {
      ...defaultHeaders,
      ...extraHeaders,
    };
    const proxyAgent = new HttpsProxyAgent(proxy);
    const config = {
      method,
      url,
      headers,
      httpsAgent: proxyAgent,
      timeout: this.timeout,
    };
    if (data) {
      config.data = data;
    }
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error(`The request times out later ${this.timeout}ms`);
      }
      throw new Error(`The request failed: ${error.message}`);
    }
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * 1000) + 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async collectCoin(token, amount, proxy) {
    const url = `${baseUrl}/game/collectCoin`;
    try {
      const response = await this.makeRequest("post", url, amount, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getAccountInfo(token, proxy) {
    try {
      const url = `${baseUrl}/account/getAccountInfo`;
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        // console.log(response);
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getGameInfo(token, proxy) {
    try {
      const url = `${baseUrl}/game/getGameInfo`;
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async useSpecialBox(token, proxy) {
    const url = `${baseUrl}/game/recoverSpecialBox`;
    try {
      const response = await this.makeRequest("post", url, {}, token, proxy);
      if (response.code === 0) {
        await this.log("Kích hoạt rương...", "success");
        return true;
      } else {
        await this.log("Chest activation failed!", "error");
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async getSpecialBoxInfo(token, proxy) {
    try {
      const url = `${baseUrl}/game/getSpecialBoxInfo`;
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getuser(token, proxy) {
    try {
      const url = `${baseUrl}/account/getRankingList?index=1&pageSize=1&rankType=1&userLevel=1`;
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.data.myUserNick) {
        return response.data.myUserNick;
      }
      return "no nickname";
    } catch (error) {
      return "no nickname";
    }
  }

  async collectFromSpecialBox(token, boxType, coinCount, proxy) {
    const url = `${baseUrl}/game/collectSpecialBoxCoin`;
    const data = { boxType, coinCount };
    try {
      const response = await this.makeRequest("post", url, data, token, proxy);
      if (response.code === 0) {
        if (response.data.collectStatus) {
          await this.log(`Open the chest to receive ${response.data.collectAmount} Coins`, "success");
          return {
            success: true,
            collectedAmount: response.data.collectAmount,
          };
        } else {
          return { success: true, collectedAmount: 0 };
        }
      } else {
        return { success: false, collectedAmount: 0 };
      }
    } catch (error) {
      return { success: false, collectedAmount: 0 };
    }
  }

  async attemptCollectSpecialBox(token, boxType, initialCoinCount, proxy) {
    let coinCount = initialCoinCount;
    while (coinCount > 0) {
      const result = await this.collectFromSpecialBox(token, boxType, coinCount, proxy);
      if (result.success) {
        return result.collectedAmount;
      }
      coinCount -= 20;
    }
    await this.log("Can't collect chests!", "error");
    return 0;
  }

  async getAccountBuildInfo(token, proxy) {
    try {
      const url = `${baseUrl}/build/getAccountBuildInfo`;
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getSquadInfo(token, proxy) {
    const url = `${baseUrl}/squad/mySquad`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async joinSquad(token, squadLink, proxy) {
    const url = `${baseUrl}/squad/joinSquad`;
    const data = { squadTgLink: squadLink };
    try {
      const response = await this.makeRequest("post", url, data, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async recoverCoinPool(token, proxy) {
    const url = `${baseUrl}/game/recoverCoinPool`;
    try {
      const response = await this.makeRequest("post", url, {}, token, proxy);
      if (response.code === 0) {
        await this.log("Recovery successful!", "success");
        return true;
      } else {
        await this.log("Recovery failed!", "error");
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async getUpgradeTaskList(token, proxy) {
    const url = `${baseUrl}/task/getUserUpgradeTaskList`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response.data;
      } else {
        await this.log(`Could not get task list: ${response.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async finishUpgradeTask(token, taskId, proxy) {
    const url = `${baseUrl}/task/finishUserUpgradeTask`;
    try {
      const response = await this.makeRequest("post", url, taskId, token, proxy);
      if (response.code === 0) {
        await this.log(`Do the task ${taskId} success | Award: ${response.data.bonusAmount}`, "success");
        return true;
      } else {
        await this.log(`Do the task ${taskId} failure:${response.message}`, "error");
        return false;
      }
    } catch (error) {
      await this.log(`Error during mission: ${error.message}`, "error");
      return false;
    }
  }

  async getTaskList(token, proxy) {
    const url = `${baseUrl}/task/getCommonTaskList`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response.data;
      } else {
        await this.log(`Could not get task list: ${response.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async finishTask(token, taskId, proxy) {
    const url = `${baseUrl}/task/finishTask`;
    try {
      const response = await this.makeRequest("post", url, taskId, token, proxy);
      if (response.code === 0) {
        await this.log(`Task ${taskId} succeeded | Award: ${response.data.bonusAmount}`, "success");
        return true;
      } else {
        await this.log(`Making task ${taskId} fail: ${response.message}`, "error");
        return false;
      }
    } catch (error) {
      await this.log(`Error while doing the task: ${error.message}`, "error");
      return false;
    }
  }

  async processTasks(token, proxy) {
    let tasks = await this.getTaskList(token, proxy);
    tasks = tasks?.filter((task) => !settings.SKIP_TASKS.includes(task.taskId)) || [];
    const tasksUpgrade = await this.getUpgradeTaskList(token, proxy);
    // console.log("tasksUpgrade", tasksUpgrade);
    const listTaskBonusUpgrade = tasksUpgrade?.taskBonusBaseResponseList || [];
    const userLevel = tasksUpgrade?.userLevel || 0;
    if (tasks) {
      for (const task of tasks) {
        await sleep(3);
        if (task.taskStatus === 0) {
          await this.finishTask(token, task.taskId, proxy);
        }
      }
    }
    await sleep(3);
    if (listTaskBonusUpgrade) {
      for (const taskUpgrade of listTaskBonusUpgrade) {
        if (taskUpgrade.taskStatus === 0 && taskUpgrade.taskUserLevel < userLevel) {
          await this.finishUpgradeTask(token, taskUpgrade.taskId, proxy);
        }
      }
    }
  }

  async lSquad(token, proxy) {
    const url = `${baseUrl}/squad/leaveSquad`;
    try {
      const response = await this.makeRequest("post", url, null, token, proxy);
      if (response.code === 0) {
        return response;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getTaskListDaily(token, proxy) {
    const url = `${baseUrl}/mission/getDailyMission`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        return response.data;
      } else {
        await this.log(`Unable to get task list: ${response.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async getListCheckIn(token, proxy) {
    const url = `${baseUrl}/signIn/list`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      let today = null;
      if (response.code === 0 && response.data.length > 0) {
        const Indextommorow = response.data.findIndex((x) => x.openIn > 0 && x.reward == 0);
        if (Indextommorow > 0 && response.data[Indextommorow - 1].reward == 0) {
          today = response.data[Indextommorow - 1];
        } else if (Indextommorow == 0) {
          today = response.data[0];
        }
        if (today) {
          return today.id;
        }
        return null;
      } else {
        await this.log(`Unable to get attendance list: ${response.data.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error getListCheckIn: " + error.message, "error");
      return null;
    }
  }

  async getWallet(token, proxy) {
    const url = `${baseUrl}/wallet/getWallet`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);
      if (response.code === 0) {
        this.wallet = response.data[0]?.friendlyAddress;
        return response.data[0]?.friendlyAddress;
      } else {
        await this.log(`Failed to get wallet address: ${response.data.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async getDailyTaskBonus(token, proxy) {
    const url = `${baseUrl}/task/getFinishTaskBonusInfo`;
    try {
      const response = await this.makeRequest("get", url, null, token, proxy);

      if (response.code === 0 && response.data.dailyTaskFinishCount >= 4 && response.data.dailyTaskBonusStatus == 1) {
        await this.claimBonus(token, 1, proxy);
      }
      if (response.code === 0 && response.data.commonTaskFinishCount >= 6 && response.data.commonTaskBonusStatus == 1) {
        await this.claimBonus(token, 2, proxy);
      }
    } catch (error) {
      this.log(`An error occurred getDailyTaskBonus: ${error.message}`, "error");
      return null;
    }
  }

  async claimBonus(token, id = 1, proxy) {
    const url = `${baseUrl}/task/claimBonus`;
    try {
      const response = await this.makeRequest("post", url, id, token, proxy);

      if (response.code === 0) {
        return this.log(`Get bonus rewards: ${response.data.bonusAmount}`, "success");
      } else {
        return this.log(`Received reward`, "warning");
      }
    } catch (error) {
      this.log(`An error occurred claimingBonus: ${error.message}`, "error");
      return null;
    }
  }

  async checkIn(token, proxy) {
    const url = `${baseUrl}/signIn/claim`;
    await this.getWallet(token, proxy);
    const id = await this.getListCheckIn(token, proxy);
    this.log("Bắt đầu checkin");
    try {
      if (id) {
        const params = {
          createAt: new Date().getTime(),
          destination: this.wallet || "",
          id: id,
          signInType: 1,
        };
        const response = await this.makeRequest("post", url, params, token, proxy);
        if (response.data.code === 0) {
          await this.log(`Checkin successful, received: ${response.data.reward}`, "success");
          return null;
        } else {
          await this.log(`Cannot Checkin: ${response.data.message}`, "error");
          return null;
        }
      } else {
        // this.log(`Bạn đã Checkin hôm nay`, "warning");
      }
    } catch (error) {
      await this.log("Error Checkin: " + error.message, "error");
      return null;
    }
  }

  async finishTaskDaily(token, taskId, proxy) {
    const url = `${baseUrl}/mission/finishDailyMission`;
    try {
      const response = await this.makeRequest("post", url, taskId, token, proxy);
      if (response.code === 0) {
        await this.log(`Task ${taskId} succeeded | Award:${response.data.reward}`, "success");
        return true;
      } else {
        await this.log(`Task ${taskId} failed: ${response.message}`, "error");
        return false;
      }
    } catch (error) {
      await this.log(`Error while doing the task: ${error.message}`, "error");
      return false;
    }
  }

  async processTasksDaily(token, proxy) {
    this.log("Start doing daily quest");
    let tasksDaily = [];
    //task dayily
    tasksDaily = await this.getTaskListDaily(token, proxy);
    if (tasksDaily)
      for (const task of tasksDaily) {
        if (task.missionStatus === 0) {
          await this.finishTaskDaily(token, task.missionId, proxy);
        } else {
          // await this.log("Nhiệm vụ hàng ngày đã hoàn thành", "success");
        }
      }
  }

  async upgradeLevel(token, currentLevel, targetLevel, upgradeType, proxy) {
    const url = `${baseUrl}/build/levelUp`;
    let upgradeTypeName = "";
    switch (upgradeType) {
      case "1":
        upgradeTypeName = "Multi Value";
        break;
      case "2":
        upgradeTypeName = "Fill Rate";
        break;
      case "3":
        upgradeTypeName = "Coin Limit";
        break;
      default:
        "";
    }

    while (currentLevel < targetLevel) {
      try {
        const response = await this.makeRequest("post", url, upgradeType, token, proxy);
        if (response.code === 0) {
          currentLevel++;
          await this.log(`Upgrade ${upgradeTypeName} to Lv ${currentLevel}`, "success");
        } else {
          await this.log(`Upgrade failed: ${response.message}`, "error");
          break;
        }
      } catch (error) {
        await this.log("Upgrade error: "+ error.message, "error");
        break;
      }
    }

    if (currentLevel === targetLevel) {
      await this.log(`${upgradeTypeName} already at the level${currentLevel}`, "info");
    }
  }

  generateClaimSign(params, secretKey) {
    const { id, tm, claimType } = params;
    const inputString = id + tm + secretKey + claimType;
    const sign = crypto.createHash("md5").update(inputString).digest("hex");
    return sign;
  }

  async handleSwipeBot(token, proxy) {
    const url = `${baseUrl}/build/getAccountBuildInfo`;
    try {
      const accountBuildInfo = await this.makeRequest("get", url, null, token, proxy);
      if (accountBuildInfo.code === 0) {
        const { swipeBotLevel, openSwipeBot } = accountBuildInfo.data;
        if (swipeBotLevel < 1) {
          const upgradeUrl = `${baseUrl}/build/levelUp`;
          const upgradeResponse = await this.makeRequest("post", upgradeUrl, 4, token, proxy);
          if (upgradeResponse.code === 0) {
            await this.log("Successfully purchased SwipeBot", "success");
          } else {
            await this.log("SwipeBot purchase fails", "error");
          }
        }

        if (swipeBotLevel >= 1 && !openSwipeBot) {
          await sleep();
          const toggleUrl = `${baseUrl}/build/toggleSwipeBotSwitch`;
          const toggleResponse = await this.makeRequest("post", toggleUrl, true, token, proxy);
          if (toggleResponse.code === 0) {
            await this.log("Successfully turned on SwipeBot", "success");
          } else {
            await this.log("Turn on SwipeBot failed", "error");
          }
        }

        if (swipeBotLevel >= 1 && openSwipeBot) {
          await sleep();
          const offlineBonusUrl = `${baseUrl}/game/getOfflineYesPacBonusInfo`;
          const offlineBonusInfo = await this.makeRequest("get", offlineBonusUrl, null, token, proxy);
          if (offlineBonusInfo.code === 0 && offlineBonusInfo.data.length > 0) {
            const claimUrl = `${baseUrl}/game/claimOfflineBonus`;
            const tm = Math.floor(Date.now() / 1000);
            const claimData = {
              id: offlineBonusInfo.data[0].transactionId,
              createAt: tm,
              claimType: 1,
              destination: this.wallet || "",
            };

            const signParams = {
              id: claimData.id,
              tm: tm,
              claimType: claimData.claimType,
            };

            const secretKey = "6863b339db454f5bbd42ffb5b5ac9841";
            const sign = this.generateClaimSign(signParams, secretKey);
            const headers = {
              ...this.baseheaders,
              Sign: sign,
              Tm: tm.toString(),
              Token: token,
            };
            await sleep();
            const claimResponse = await this.makeRequest("post", claimUrl, claimData, token, proxy, headers);
            if (claimResponse.code === 0) {
              await this.log(`Claim offline bonus successfully, receive ${claimResponse.data.collectAmount} coins`, "success");
            } else {
              await this.log(`Claim offline bonus failed: ${claimResponse.message}`, "error");
            }
          }
        }
      } else {
        await this.log("Unable to get SwipeBot information", "error");
      }
    } catch (error) {
      await this.log(`Error handling SwipeBot: ${error.message}`, "error");
    }
  }

  async performTaskWithTimeout(task, taskName, timeoutMs = this.timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${taskName} time out later ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await task();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async main() {
    if (!settings.BASE_URL_API) {
      this.log("Please provide BASE_URL_API in .env".red);
      process.exit(0);
    }

    try {
      const encodedData = this.account;
      const userData = JSON.parse(decodeURIComponent(encodedData.split("user=")[1].split("&")[0]));
      const firstName = userData.first_name || "";
      const lastName = userData.last_name || "";
      const userId = userData.id;
      this.session_name = userId;
      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`=========Account ${this.accountIndex + 1} | ${firstName + " " + lastName}| Rest ${timesleep} before starting=============`.green);
      this.set_headers();
      await sleep(timesleep);
      try {
        this.proxyIP = await this.performTaskWithTimeout(() => this.checkProxyIP(this.proxy), "Checking proxy IP", 10000);
        await this.log(`Proxy IP: ${this.proxyIP}`, "info");
      } catch (error) {
        await this.log(`Error checking proxy IP: ${error.message}`, "error");
        process.exit(0);
      }

      try {
        this.token = await this.performTaskWithTimeout(() => this.getOrRefreshToken(this.account, this.proxy), "Getting token", 20000);
      } catch (error) {
        await this.log(`Cannot get tokens: ${error.message}`, "error");
        return;
      }
      await this.performTasks();
    } catch (error) {
      await this.log(`Lỗi rồi: ${error.message}`, "error");
    } finally {
      if (!isMainThread) {
        parentPort.postMessage("taskComplete");
      }
    }
  }

  async performTasks() {
    try {
      // const nickname = await this.performTaskWithTimeout(() => this.getuser(this.token, this.proxy), "Getting user info", 15000);

      if (settings.AUTO_JOIN_SQUARD) {
        const squadInfo = await this.performTaskWithTimeout(() => this.getSquadInfo(this.token, this.proxy), "Getting squad info", 15000);
        if (squadInfo && squadInfo?.data?.isJoinSquad && squadInfo.data.squadInfo.squadId != "1832357488363344000") {
          await this.lSquad(this.token, this.proxy);
          await this.joinSquad(this.token, "t.me/D4rkCipherX");
        } else if (!squadInfo?.data?.isJoinSquad) {
          const joinResult = await this.performTaskWithTimeout(() => this.joinSquad(this.token, "t.me/D4rkCipherX", this.proxy), "Joining squad", 20000);
          if (joinResult) {
            await this.log(`join squad successfully !`, "success");
          } else {
            await this.log(`join squad failed !`, "error");
          }
        }
      }
      await sleep();
      const balance = await this.performTaskWithTimeout(() => this.getAccountInfo(this.token, this.proxy), "Getting account info", 15000);
      if (balance === null) {
        await this.log("Balance: Unable to read balance", "error");
      } else {
        const currentAmount = balance.data.currentAmount.toLocaleString().replace(/,/g, ".");
        await this.log(`Balance: ${currentAmount}`, "info");
      }

      const gameInfo = await this.performTaskWithTimeout(() => this.getAccountBuildInfo(this.token, this.proxy), "Getting game info", 15000);
      if (gameInfo === null) {
        await this.log("Can't get game data!", "error");
      } else {
        const { specialBoxLeftRecoveryCount, coinPoolLeftRecoveryCount, singleCoinValue, singleCoinLevel, coinPoolTotalLevel, coinPoolRecoveryLevel, coinPoolRecoverySpeed, swipeBotLevel } =
          gameInfo.data;
        await this.log(`Booster: Chest ${specialBoxLeftRecoveryCount} | Recovery ${coinPoolLeftRecoveryCount}`, "info");
        await this.log(`Multivalue: ${singleCoinLevel} | Coin Limit: ${coinPoolTotalLevel} | Fill Rate: ${coinPoolRecoveryLevel} | Swipe Bot: ${swipeBotLevel}`, "info");
      }

      if (settings.AUTO_DAILY_REWARD) {
        await this.performTaskWithTimeout(() => this.checkIn(this.token, this.proxy), "Processing checkin", 60000);
        await sleep(3);
        await this.performTaskWithTimeout(() => this.processTasksDaily(this.token, this.proxy), "Processing tasksdaily", 60000);
        await sleep(3);
        await this.performTaskWithTimeout(() => this.getDailyTaskBonus(this.token, this.proxy), "Processing tasksdaily", 60000);
      }
      await sleep(3);
      await this.performTaskWithTimeout(() => this.handleSwipeBot(this.token, this.proxy), "Handling SwipeBot", 30000);
      if (settings.AUTO_TASK) {
        await this.performTaskWithTimeout(() => this.processTasks(this.token, this.proxy), "Processing tasks", 60000);
      }

      if (settings.AUTO_UPGRADE_MULTI && gameInfo) {
        await sleep();
        await this.performTaskWithTimeout(() => this.upgradeLevel(this.token, gameInfo.data.singleCoinValue, settings.MAX_LEVEL_UPGRADE, "1", this.proxy), "Upgrading Multi", 60000);
      }
      if (settings.AUTO_UPGRADE_FILL && gameInfo) {
        await sleep();
        await this.performTaskWithTimeout(() => this.upgradeLevel(this.token, gameInfo.data.coinPoolRecoverySpeed, settings.MAX_LEVEL_UPGRADE, "2", this.proxy), "Upgrading Fill", 60000);
      }
      if (settings.AUTO_UPGRADE_COINLIMIT && gameInfo) {
        await sleep();
        await this.performTaskWithTimeout(() => this.upgradeLevel(this.token, gameInfo.data.coinPoolTotalLevel, settings.MAX_LEVEL_UPGRADE, "3", this.proxy), "Upgrading Coinlimit", 60000);
      }
      const collectInfo = await this.performTaskWithTimeout(() => this.getGameInfo(this.token, this.proxy), "Getting collect info", 15000);
      if (collectInfo === null) {
        await this.log("Can't get game data!", "error");
      } else {
        const { singleCoinValue, coinPoolLeftCount } = collectInfo.data;
        await this.log(`Remaining energy ${coinPoolLeftCount}`, "info");
        await sleep();
        if (coinPoolLeftCount > 0) {
          const amount = Math.floor(coinPoolLeftCount / singleCoinValue);
          const collectResult = await this.performTaskWithTimeout(() => this.collectCoin(this.token, amount, this.proxy), "Collecting coins", 30000);
          if (collectResult && collectResult.code === 0) {
            const collectedAmount = collectResult.data.collectAmount;
            await this.log(`Tap successfully, receive ${collectedAmount} coins`, "success");
          } else {
            await this.log("Tap failed!", "error");
          }
        }
      }
      await sleep();
      if (gameInfo && gameInfo.data.specialBoxLeftRecoveryCount > 0) {
        const useSpecialBoxResult = await this.performTaskWithTimeout(() => this.useSpecialBox(this.token, this.proxy), "Using special box", 30000);
        if (useSpecialBoxResult) {
          const collectedAmount = await this.performTaskWithTimeout(() => this.attemptCollectSpecialBox(this.token, 2, 200, this.proxy), "Collecting from special box", 60000);
          await this.log(`Collected ${collectedAmount} from special box`, "success");
        }
      }
      await sleep();

      const updatedGameInfo = await this.performTaskWithTimeout(() => this.getAccountBuildInfo(this.token, this.proxy), "Getting updated game info", 15000);
      if (updatedGameInfo && updatedGameInfo.data.coinPoolLeftRecoveryCount > 0) {
        const recoverResult = await this.performTaskWithTimeout(() => this.recoverCoinPool(this.token, this.proxy), "Recovering coin pool", 30000);
        if (recoverResult) {
          const updatedCollectInfo = await this.performTaskWithTimeout(() => this.getGameInfo(this.token, this.proxy), "Getting updated collect info", 15000);
          if (updatedCollectInfo) {
            const { coinPoolLeftCount, singleCoinValue } = updatedCollectInfo.data;
            if (coinPoolLeftCount > 0) {
              const amount = Math.floor(coinPoolLeftCount / singleCoinValue);
              const collectResult = await this.performTaskWithTimeout(() => this.collectCoin(this.token, amount, this.proxy), "Collecting coins after recovery", 30000);
              if (collectResult && collectResult.code === 0) {
                const collectedAmount = collectResult.data.collectAmount;
                await this.log(`Tap successfully after recovery, receive ${collectedAmount} coins`, "success");
              } else {
                await this.log("Tap failed after recovery!", "error");
              }
            }
          }
        }
      }

      const freeChestCollectedAmount = await this.performTaskWithTimeout(() => this.attemptCollectSpecialBox(this.token, 1, 200, this.proxy), "Collecting from free chest", 30000);
      await this.log(`Collected ${freeChestCollectedAmount} from free chest`, "success");
    } catch (error) {
      await this.log(`Error in performTasks: ${error.message}`, "error");
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} seconds to continue`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Start a new loop...`);
}

async function runworker() {
  const accounts = fs.readFileSync("data.txt", "utf-8").replace(/\r/g, "").split("\n").filter(Boolean);
  const proxies = fs.readFileSync("proxy.txt", "utf-8").replace(/\r/g, "").split("\n").filter(Boolean);
  let activeWorkers = 0;

  accounts.map((account, i) => new YesCoinBot(i, account, proxies[i]).createUserAgent());

  async function processCycle() {
    const numThreads = Math.min(settings.MAX_THEADS || 10, accounts.length);
    let accountQueue = [...accounts];
    async function startWorker() {
      if (accountQueue.length === 0) {
        if (activeWorkers === 0) {
          console.log("Complete all accounts.".magenta);
          updateEnv("AUTO_DAILY_REWARD", "false");
          await sleep(3);
          await wait(settings.TIME_SLEEP * 60);
          processCycle();
        }
        return;
      }
      const accountIndex = accounts.length - accountQueue.length;
      const account = accountQueue.shift();
      const proxy = proxies[accountIndex % proxies.length];
      const parser = parse(account);
      const user = JSON.parse(parser.user);
      const userid = user.id;

      activeWorkers++;

      const worker = new Worker(__filename, {
        workerData: {
          userId: userid,
          accountIndex: accountIndex,
          account: account,
          proxy: proxy,
        },
      });

      worker.on("message", (message) => {
        if (message === "taskComplete") {
          worker.terminate();
        }
      });

      worker.on("error", (error) => {
        console.error(`Worker error: ${error}`.red);
        activeWorkers--;
        startWorker();
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(`The stream is stopped with code${code}`.red);
        }
        activeWorkers--;
        startWorker();
      });
    }

    for (let i = 0; i < numThreads; i++) {
      startWorker();
    }
  }

  processCycle();
}

if (isMainThread) {
  runworker();
} else {
  const bot = new YesCoinBot(workerData.accountIndex, workerData.account, workerData.proxy);
  bot.main().catch(console.error);
}
