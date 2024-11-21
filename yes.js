const fs = require("fs");
const axios = require("axios");
const colors = require("colors");
const path = require("path");
const crypto = require("crypto");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, updateEnv } = require("./utils");

const baseUrl = settings.BASE_URL_API;
class YesCoinBot {
  constructor() {
    this.accounts = this.loadAccounts("data.txt");
    this.tokens = this.loadTokens("token.json");
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

    this.log(`Creating user agent...`);
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
    this.baseheaders["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
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
      this.log(`Error reading wallet file: ${error.message}`, "error");
      return [];
    }
  }

  loadAccounts(filePath) {
    return fs.readFileSync(filePath, "utf-8").replace(/\r/g, "").split("\n").filter(Boolean);
  }

  loadTokens(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error) {
      return {};
    }
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

  async login(encodedData, accountIndex) {
    const url = `${baseUrl}/user/login`;
    const formattedPayload = this.formatLoginPayload(encodedData);
    try {
      const response = await axios.post(url, formattedPayload, { headers: this.baseheaders });
      if (response.data.code === 0) {
        const token = response.data.data.token;
        this.saveToken(accountIndex, token);
        return token;
      } else {
        throw new Error(`Login failed: ${response.data.message}`);
      }
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  saveToken(accountIndex, token) {
    this.tokens[accountIndex] = token;
    fs.writeFileSync("token.json", JSON.stringify(this.tokens, null, 2));
  }

  async getOrRefreshToken(encodedData, accountIndex) {
    let token = this.tokens[accountIndex];
    if (!token) {
      token = await this.login(encodedData, accountIndex);
    }
    return token;
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}] [*] ${msg}`.green);
        break;
      case "error":
        console.log(`[${timestamp}] [!] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}] [*] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}] [*] ${msg}`.blue);
    }
    await this.randomDelay();
  }

  async randomDelay() {
    const delay = Math.floor(Math.random() * 300) + 300;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async collectCoin(token, amount) {
    const url = `${baseUrl}/game/collectCoin`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, amount, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getAccountInfo(token) {
    try {
      const url = `${baseUrl}/account/getAccountInfo`;
      const headers = this.headers(token);
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getGameInfo(token) {
    try {
      const url = `${baseUrl}/game/getGameInfo`;
      const headers = this.headers(token);
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async useSpecialBox(token) {
    const url = `${baseUrl}/game/recoverSpecialBox`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, {}, { headers });
      if (response.data.code === 0) {
        await this.log("Activate chest...", "success");
        return true;
      } else {
        await this.log("Chest activation failed!", "error");
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async getSpecialBoxInfo(token) {
    try {
      const url = `${baseUrl}/game/getSpecialBoxInfo`;
      const headers = this.headers(token);
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getuser(token) {
    try {
      const url = `${baseUrl}/account/getRankingList?index=1&pageSize=1&rankType=1&userLevel=1`;
      const headers = this.headers(token);
      const response = await axios.get(url, { headers });
      if (response.data.data.myUserNick) {
        return response.data.data.myUserNick;
      }
      return "no nickname";
    } catch (error) {
      return "no nickname";
    }
  }

  async collectFromSpecialBox(token, boxType, coinCount) {
    const url = `${baseUrl}/game/collectSpecialBoxCoin`;
    const headers = this.headers(token);
    const data = { boxType, coinCount };
    try {
      const response = await axios.post(url, data, { headers });
      if (response.data.code === 0) {
        if (response.data.data.collectStatus) {
          await this.log(`Open the chest to receive ${response.data.data.collectAmount} Coins`, "success");
          return {
            success: true,
            collectedAmount: response.data.data.collectAmount,
          };
        } else {
          await this.log("No chest!", "warning");
          return { success: true, collectedAmount: 0 };
        }
      } else {
        await this.log(`Open chest failed: ${response.data.message}`, "error");
        return { success: false, collectedAmount: 0 };
      }
    } catch (error) {
      return { success: false, collectedAmount: 0 };
    }
  }

  async attemptCollectSpecialBox(token, boxType, initialCoinCount) {
    let coinCount = initialCoinCount;
    while (coinCount > 0) {
      const result = await this.collectFromSpecialBox(token, boxType, coinCount);
      if (result.success) {
        return result.collectedAmount;
      }
      coinCount -= 20;
    }
    await this.log("Cannot collect chest!", "error");
    return 0;
  }

  async getAccountBuildInfo(token) {
    try {
      const url = `${baseUrl}/build/getAccountBuildInfo`;
      const headers = this.headers(token);
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getSquadInfo(token) {
    const url = `${baseUrl}/squad/mySquad`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async joinSquad(token, squadLink) {
    const url = `${baseUrl}/squad/joinSquad`;
    const headers = this.headers(token);
    const data = { squadTgLink: squadLink };
    try {
      const response = await axios.post(url, data, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async lSquad(token) {
    const url = `${baseUrl}/squad/leaveSquad`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, null, { headers });
      if (response.data.code === 0) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async recoverCoinPool(token) {
    const url = `${baseUrl}/game/recoverCoinPool`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, {}, { headers });
      if (response.data.code === 0) {
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

  async getTaskList(token) {
    const url = `${baseUrl}/task/getCommonTaskList`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data.data;
      } else {
        await this.log(`Unable to get task list: ${response.data.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async getTaskListDaily(token) {
    const url = `${baseUrl}/mission/getDailyMission`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        return response.data.data;
      } else {
        await this.log(`Can't get daily task list: ${response.data.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error: " + error.message, "error");
      return null;
    }
  }

  async getListCheckIn(token) {
    const url = `${baseUrl}/signIn/list`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      let today = null;
      if (response.data.code === 0 && response.data.data.length > 0) {
        const Indextommorow = response.data.data.findIndex((x) => x.openIn > 0 && x.reward == 0);
        if (Indextommorow > 0 && response.data.data[Indextommorow - 1].reward == 0) {
          today = response.data.data[Indextommorow - 1];
        } else if (Indextommorow == 0) {
          today = response.data.data[0];
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
      await this.log("Error getlistcheckin: " + error.message, "error");
      return null;
    }
  }

  async getWallet(token) {
    const url = `${baseUrl}/wallet/getWallet`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      if (response.data.code === 0) {
        this.wallet = response.data.data[0]?.friendlyAddress;
        return response.data.data[0]?.friendlyAddress;
      } else {
        await this.log(`Unable to get wallet address: ${response.data.message}`, "error");
        return null;
      }
    } catch (error) {
      await this.log("Error getWallet: " + error.message, "error");
      return null;
    }
  }

  async getDailyTaskBonus(token) {
    const url = `${baseUrl}/task/getFinishTaskBonusInfo`;
    const headers = this.headers(token);
    try {
      const response = await axios.get(url, { headers });
      if (response.data.code === 0 && response.data.data.dailyTaskFinishCount >= 4 && response.data.data.dailyTaskBonusStatus == 1) {
        await this.claimBonus(token, 1);
      }
      if (response.data.code === 0 && response.data.data.commonTaskFinishCount >= 6 && response.data.data.commonTaskBonusStatus === 1) {
        await this.claimBonus(token, 2);
      }
    } catch (error) {
      this.log(`An error occurred.getDailyTaskBonus: ${error.message}`, "error");
      return null;
    }
  }

  async claimBonus(token, id = 1) {
    const url = `${baseUrl}/task/claimBonus`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, id, { headers });
      if (response.data.code === 0) {
        return this.log(`Get bonus rewards: ${response.data.data.bonusAmount}`, "success");
      } else {
        return this.log(`Received reward`, "warning");
      }
    } catch (error) {
      this.log(`An error occurred claimBonus: ${error.message}`, "error");
      return null;
    }
  }

  async checkIn(token) {
    const url = `${baseUrl}/signIn/claim`;
    const headers = this.headers(token);
    await this.getWallet(token);
    const id = await this.getListCheckIn(token);
    try {
      if (id) {
        const params = {
          createAt: new Date().getTime(),
          destination: this.wallet || "",
          id: id,
          signInType: 1,
        };
        const response = await axios.post(url, params, { headers });
        if (response.data.code === 0) {
          await this.log(`Checkin successful, received: ${response.data.reward}`, "success");
          return null;
        } else {
          await this.log(`Unable to Checkin: ${response.data.message}`, "error");
          return null;
        }
      } else {
        this.log(`You checked in today`, "warning");
      }
    } catch (error) {
      await this.log("Error checkin: " + error.message, "error");
      return null;
    }
  }

  async finishTaskDaily(token, taskId) {
    const url = `${baseUrl}/mission/finishDailyMission`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, taskId, { headers });
      if (response.data.code === 0) {
        await this.log(`Do the task ${taskId} success | Award: ${response.data.data.reward}`, "success");
        return true;
      } else {
        await this.log(`Do the task ${taskId} failure: ${response.data.message}`, "error");
        return false;
      }
    } catch (error) {
      await this.log(`Error while doing the task: ${error.message}`, "error");
      return false;
    }
  }

  async finishTask(token, taskId) {
    const url = `${baseUrl}/task/finishTask`;
    const headers = this.headers(token);
    try {
      const response = await axios.post(url, taskId, { headers });
      if (response.data.code === 0) {
        await this.log(`Do the task ${taskId} success| Award: ${response.data.data.bonusAmount}`, "success");
        return true;
      } else {
        await this.log(`Do the task ${taskId} failure: ${response.data.message}`, "error");
        return false;
      }
    } catch (error) {
      await this.log(`Error while doing the task: ${error.message}`, "error");
      return false;
    }
  }

  async processTasks(token) {
    let tasks = await this.getTaskList(token);
    tasks = tasks?.filter((task) => !settings.SKIP_TASKS.includes(task.taskId)) || [];
    if (tasks) {
      for (const task of tasks) {
        await sleep(3);
        if (task.taskStatus === 0) {
          await this.finishTask(token, task.taskId);
        } else {
          // await this.log("Nhiệm vụ đã hoàn thành", "info");
        }
      }
    }
  }

  async processTasksDaily(token) {
    //task dayily
    const tasksDaily = await this.getTaskListDaily(token);
    if (tasksDaily)
      for (const task of tasksDaily) {
        await sleep(3);
        if (task.missionStatus === 0) {
          await this.finishTaskDaily(token, task.missionId);
        } else {
          // await this.log("Nhiệm vụ hàng ngày đã hoàn thành", "success");
        }
      }
    this.timeResetDaily = new Date(); //1 ngày;
    this.log("Complete daily tasks");
  }

  async upgradeLevel(token, currentLevel, targetLevel, upgradeType) {
    const url = `${baseUrl}/build/levelUp`;
    const headers = this.headers(token);
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
        const response = await axios.post(url, upgradeType, { headers });
        if (response.data.code === 0) {
          currentLevel++;
          await this.log(`Upgrade ${upgradeTypeName} up lv ${currentLevel}`, "success");
        } else {
          await this.log(`Upgrade failed: ${response.data.message}`, "error");
          break;
        }
      } catch (error) {
        await this.log("Upgrade error: " + error.message, "error");
        break;
      }
    }

    if (currentLevel === targetLevel) {
      await this.log(`${upgradeTypeName} was at the level ${currentLevel}`, "info");
    }
  }

  async wait(seconds) {
    for (let i = seconds; i > 0; i--) {
      process.stdout.write(`\r${colors.cyan(`[*] Wait${Math.floor(i / 60)} minute ${i % 60}seconds to continue`)}`.padEnd(80));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log(`Start new loop...`);
  }

  async makeRequest(method, url, data = null, token, extraHeaders = {}) {
    const defaultHeaders = this.headers(token);
    const headers = {
      ...defaultHeaders,
      ...extraHeaders,
    };
    const config = {
      method,
      url,
      headers,
      timeout: 30000,
    };
    if (data) {
      config.data = data;
    }
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.code === "ECONNABORTED") {
        throw new Error(`Request timed out after${30000}ms`);
      }
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  generateClaimSign(params, secretKey) {
    const { id, tm, claimType } = params;
    const inputString = id + tm + secretKey + claimType;
    const sign = crypto.createHash("md5").update(inputString).digest("hex");
    return sign;
  }

  async handleSwipeBot(token) {
    const url = `${baseUrl}/build/getAccountBuildInfo`;
    try {
      const accountBuildInfo = await this.makeRequest("get", url, null, token);
      if (accountBuildInfo.code === 0) {
        const { swipeBotLevel, openSwipeBot } = accountBuildInfo.data;
        if (swipeBotLevel < 1) {
          await sleep(3);
          const upgradeUrl = `${baseUrl}/build/levelUp`;
          const upgradeResponse = await this.makeRequest("post", upgradeUrl, 4, token);
          if (upgradeResponse.code === 0) {
            await this.log("SwipeBot enabled Successfully", "success");
          } else {
            await this.log("SwipeBot enabled failed", "error");
          }
        }

        if (swipeBotLevel >= 1 && !openSwipeBot) {
          await sleep(3);
          const toggleUrl = `${baseUrl}/build/toggleSwipeBotSwitch`;
          const toggleResponse = await this.makeRequest("post", toggleUrl, true, token);
          if (toggleResponse.code === 0) {
            await this.log("SwipeBot enabled successfully", "success");
          } else {
            await this.log("SwipeBot enabled failed", "error");
          }
        }

        if (swipeBotLevel >= 1 && openSwipeBot) {
          await sleep(3);
          const offlineBonusUrl = `${baseUrl}/game/getOfflineYesPacBonusInfo`;
          const offlineBonusInfo = await this.makeRequest("get", offlineBonusUrl, null, token);
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
            await sleep(3);
            const claimResponse = await this.makeRequest("post", claimUrl, claimData, token, headers);
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
      await this.log(`SwipeBot Processing Error: ${error.message}`, "error");
    }
  }

  async main() {
    this.log(colors.yellow("Tool Updated and Translated by D4rkCipherX"));

    if (!settings.BASE_URL_API) {
      this.log("Please provide BASE_URL_API in .env".red);
      process.exit(0);
    }

    while (true) {
      for (let i = 0; i < this.accounts.length; i++) {
        const accountIndex = i + 1;
        const encodedData = this.accounts[i];
        let token;
        const userData = JSON.parse(decodeURIComponent(encodedData.split("user=")[1].split("&")[0]));
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        const userId = userData.id;
        this.session_name = userId;
        console.log(`=========Account ${accountIndex}| ${firstName + " " + lastName}=============`.green);

        this.set_headers();
        try {
          token = await this.getOrRefreshToken(encodedData, userId);
        } catch (error) {
          await this.log(`Unable to get token for account${firstName + " " + lastName}: ${error.message}`, "error");
          continue;
        }
        // const nickname = await this.getuser(token);

        if (settings.AUTO_JOIN_SQUARD) {
          await this.randomDelay();
          const squadInfo = await this.getSquadInfo(token);
          if (squadInfo && squadInfo?.data?.isJoinSquad && squadInfo?.data?.squadInfo?.squadId != "1832357488363344000") {
            await this.lSquad(token);
            await this.joinSquad(token, "t.me/D4rkCipherX");
          } else if (!squadInfo?.data?.isJoinSquad) {
            await this.randomDelay();
            const joinResult = await this.joinSquad(token, "t.me/D4rkCipherX");
            if (joinResult) {
              await this.log(`Squad:Join Squad successfully !`, "success");
            } else {
              await this.log(`Squad: Join Squad failed!`, "error");
            }
          }
        }

        await this.randomDelay();
        const balance = await this.getAccountInfo(token);
        if (balance === null) {
          await this.log("Balance: Unable to read balance", "error");
          continue;
        } else {
          const currentAmount = balance.data.currentAmount.toLocaleString().replace(/,/g, ".");
          await this.log(`Balance: ${currentAmount}`, "info");
        }

        await this.randomDelay();
        const gameInfo = await this.getAccountBuildInfo(token);
        if (gameInfo === null) {
          await this.log("Unable to get game data!", "error");
          continue;
        } else {
          const { specialBoxLeftRecoveryCount, coinPoolLeftRecoveryCount, singleCoinValue, singleCoinLevel, coinPoolRecoverySpeed } = gameInfo.data;
          await this.log(`Booster: Chest ${specialBoxLeftRecoveryCount} | Recovery ${coinPoolLeftRecoveryCount}`, "info");
          await this.log(`Multivalue: Level ${singleCoinValue}`, "info");
          await this.log(`Coin Limit: Level ${singleCoinLevel}`, "info");
          await this.log(`Fill Rate: Level ${coinPoolRecoverySpeed}`, "info");
        }
        if (settings.AUTO_DAILY_REWARD) {
          await this.randomDelay();
          this.log("Start checkin");
          await this.checkIn(token);
          this.log("Start doing daily quests");
          await this.processTasksDaily(token);
          await this.getDailyTaskBonus(token);
        }

        await this.handleSwipeBot(token);
        if (settings.AUTO_TASK) {
          await this.randomDelay();
          await this.log("Start the mission...", "info");
          await this.processTasks(token);
        }

        if (settings.AUTO_UPGRADE_MULTI) {
          await this.randomDelay();
          await this.log("Start multi upgrade...", "info");
          await this.upgradeLevel(token, gameInfo.data.singleCoinValue, settings.MAX_LEVEL_UPGRADE, "1");
        }

        if (settings.AUTO_UPGRADE_FILL) {
          await this.randomDelay();
          await this.log("Start upgrading Fill Rate....", "info");
          await this.upgradeLevel(token, gameInfo.data.coinPoolRecoverySpeed, settings.MAX_LEVEL_UPGRADE, "2");
        }

        if (settings.AUTO_UPGRADE_COINLIMIT) {
          await this.randomDelay();
          await this.log("Starting Coinlimit upgrade....", "info");
          await this.upgradeLevel(token, gameInfo.data.coinPoolTotalLevel, settings.MAX_LEVEL_UPGRADE, "3");
        }

        await this.randomDelay();
        const collectInfo = await this.getGameInfo(token);
        if (collectInfo === null) {
          await this.log("Unable to get game data!", "error");
          continue;
        } else {
          const { singleCoinValue, coinPoolLeftCount } = collectInfo.data;
          await this.log(`Remaining energy ${coinPoolLeftCount}`, "info");

          if (coinPoolLeftCount > 0) {
            await this.randomDelay();
            const amount = Math.floor(coinPoolLeftCount / singleCoinValue);
            const collectResult = await this.collectCoin(token, amount);
            if (collectResult && collectResult.code === 0) {
              const collectedAmount = collectResult.data.collectAmount;
              await this.log(`Tap success, get ${collectedAmount} coins`, "success");
            } else {
              await this.log("Tap failed!", "error");
            }
          }
        }

        await this.randomDelay();
        await this.log("Check the number of chests left...", "info");
        if (gameInfo && gameInfo.data.specialBoxLeftRecoveryCount > 0) {
          if (await this.useSpecialBox(token)) {
            await this.randomDelay();
            await this.log("Start collecting...", "info");
            await this.attemptCollectSpecialBox(token, 2, 200);
          }
        } else {
          await this.log("No chests!", "warning");
        }

        await this.randomDelay();
        await this.log("Start recovery...", "info");
        const updatedGameInfo = await this.getAccountBuildInfo(token);
        if (updatedGameInfo && updatedGameInfo.data.coinPoolLeftRecoveryCount > 0) {
          if (await this.recoverCoinPool(token)) {
            await this.randomDelay();
            const updatedCollectInfo = await this.getGameInfo(token);
            if (updatedCollectInfo) {
              const { coinPoolLeftCount, singleCoinValue } = updatedCollectInfo.data;
              if (coinPoolLeftCount > 0) {
                await this.randomDelay();
                const amount = Math.floor(coinPoolLeftCount / singleCoinValue);
                const collectResult = await this.collectCoin(token, amount);
                if (collectResult && collectResult.code === 0) {
                  const collectedAmount = collectResult.data.collectAmount;
                  await this.log(`Tap success, get ${collectedAmount} coins`, "success");
                } else {
                  await this.log("Tap failed!", "error");
                }
              }
            }
          }
        } else {
          await this.log("Recovery used up!", "warning");
        }

        await this.randomDelay();
        await this.log("Check out the free chest that appears...", "info");
        const freeChestCollectedAmount = await this.attemptCollectSpecialBox(token, 1, 200);
      }

      updateEnv("AUTO_DAILY_REWARD", "false");
      await sleep(3);
      await this.wait(settings.TIME_SLEEP * 60);
    }
  }
}

const bot = new YesCoinBot();
bot.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
