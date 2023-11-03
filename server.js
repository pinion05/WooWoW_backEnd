require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const axios = require("axios");
const qs = require("querystring");
const cache = require("memory-cache");
const Redis = require("ioredis");
const port = process.env.PORT;
const redis = new Redis({
  port: process.env.REDIS_PORT, // Redis port
  host: process.env.REDIS_HOST, // Redis host
  username: process.env.REDIS_USERNAME, // needs Redis >= 6
  password: process.env.REDIS_PASSWORD,
  db: 0, // Defaults to 0
});

app.use(express.json());
app.use(
  cors({
    origin: [
      `http://localhost:3000`,
      `https://woowow.vercel.app`,
      "https://woo-wow.vercel.app",
    ],
    methods: ["GET", "POST", "DELETE"],
    credentialfpwjses: true,
  })
);

async function getAccessToken() {
  if (!cache.get("token")) {
    console.log("token not found");
    try {
      const response = await axios.post(
        "https://oauth.battle.net/token",
        qs.stringify({
          grant_type: "client_credentials",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${clientID}:${clientSecret}`
            ).toString("base64")}`,
          },
        }
      );
      const { access_token, expires_in } = response.data;
      cache.put("token", access_token, expires_in * 1000);
    } catch (error) {
      console.log("getToken fail");
      console.log(error);
    }
  } else {
    console.log("token was already");
  }
}

getAccessToken().then(() => {
  const accessToken = cache.get("token");
  console.log(`✨token = ${accessToken}`);
});

app.get("/", (req, res) => {
  res.status(200).json("루트입니다");
  return;
});

app.get(`/api/character`, async (req, res) => {
  const charactername = req.query.charactername;
  const redisCache = JSON.parse(
    await redis.get(`character_card_${charactername}`)
  );
  if (redisCache) {
    res.status(200).json(redisCache);
    return;
  }
  await getAccessToken();
  const accessToken = cache.get("token");
  const encodedName = encodeURIComponent(charactername);
  if (!accessToken) {
    console.log(`accessToken 을 찾을 수 없습니다.`);
  }

  console.log(`❌ Redis ${charactername} 캐릭터 캐시없음`);
  try {
    const characterResponse = await axios.get(
      `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedName}?namespace=profile-classic1x-kr&locale=ko_KR&access_token=${accessToken}`
    );
    const characterResponseData = characterResponse.data;

    await redis.set(
      `character_card_${charactername}`,
      JSON.stringify(characterResponseData),
      "EX",
      60 * 1
    );
    res.status(200).json(characterResponseData);
    return;
  } catch (error) {
    console.log("에러발생");
    console.log(error);
    res.status(500).send(error);
  }
});

app.get(`/api/characterinfo`, async (req, res) => {
  const charactername = req.query.charactername;
  const redisCache = JSON.parse(
    await redis.get(`character_info_${charactername}`)
  );
  if (redisCache) {
    res.status(200).json(redisCache);
    return;
  }
  await getAccessToken();
  const accessToken = cache.get("token");
  const encodedName = encodeURIComponent(charactername);
  if (!accessToken) {
    console.log(`accessToken 을 찾을 수 없습니다.`);
  }
  console.log(`❌ Redis ${charactername} 캐릭터정보 캐시없음`);
  try {
    let characterResponseSession;
    try {
      const characterResponse = await axios.get(
        `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedName}?namespace=profile-classic1x-kr&locale=ko_KR&access_token=${accessToken}`
      );
      characterResponseSession = characterResponse;
    } catch (error) {
      console.log("기본정보 요청에러");
    }
    let equimentResponseSession;
    try {
      const equimentResponse = await axios.get(
        `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedName}/equipment?namespace=profile-classic1x-kr&access_token=${accessToken}&locale=ko_KR`
      );
      equimentResponseSession = equimentResponse;
    } catch (error) {
      console.log("착용장비 요청에러");
    }
    let stasticsResponseSession;
    try {
      const stasticsResponse = await axios.get(
        `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedName}/statistics?namespace=profile-classic1x-kr&access_token=${accessToken}&locale=ko_KR`
      );
      stasticsResponseSession = stasticsResponse;
    } catch (error) {
      console.log("스태스틱스 요청에러");
    }

    const equimentResponseData = equimentResponseSession.data;
    const characterResponseData = characterResponseSession.data;
    const equimentItems = equimentResponseData.equipped_items;
    const stasticsResponseData = stasticsResponseSession.data;
    const equimentItemsAddURL = equimentItems.map(async (item, idx) => {
      const response = await axios.get(
        `https://kr.api.blizzard.com/data/wow/media/item/${item.media.id}?namespace=static-1.14.4_50753-classic1x-kr&access_token=${accessToken}`
      );
      const imgURL = response.data.assets[0].value;
      item.media.url = imgURL;
      return item;
    });
    const resolveEquimentItemsAddURL = await Promise.all(equimentItemsAddURL);
    characterResponseData.equipment.items = resolveEquimentItemsAddURL;
    characterResponseData.statistics.data = stasticsResponseData;
    await redis.set(
      `character_info_${charactername}`,
      JSON.stringify(characterResponseData),
      "EX",
      60 * 4
    );
    res.status(200).json(characterResponseData);
    return;
  } catch (error) {
    console.log("에러발생");
    console.log(error);
    res.status(500).send(error);
  }
});

app.get("/api/guild", async (req, res) => {
  const redisCache = await redis.get(`guild_count`);
  if (redisCache) {
    res.status(200).json(redisCache);
    return;
  }
  await getAccessToken();
  const accessToken = cache.get("token");
  if (!accessToken) {
    console.log(`accessToken 을 찾을 수 없습니다.`);
    res.status(500).send("accessToken is denine");
    return;
  }
  console.log(`❌ Redis 길드인원 캐시없음`);
  try {
    const response = await axios.get(
      `https://kr.api.blizzard.com/data/wow/guild/makgora/%EC%99%81%ED%83%80%EB%B2%84%EC%8A%A4`,
      {
        params: {
          namespace: "profile-classic1x-kr",
          locale: "ko_kr",
          access_token: accessToken,
        },
      }
    );
    if (response.status === 404) {
      res.status(500).json("error");
      return;
    }
    await redis.set(`guild_count`, response.data.member_count, "EX", 30);
    res.status(200).json(response.data.member_count);
    return;
  } catch (error) {
    console.log(`길드인원 호출실패`);
    res.status(500).json(error);
    return;
  }
});
//

app.post("/api/worldbuff", async (req, res) => {
  console.log("월법 개시시도");
  const { adminKey, buffData } = req.body;
  const redisAdminkey = await redis.get("adminKey");
  if (adminKey === redisAdminkey) {
    console.log(`키 일치`);
    console.log(adminKey, buffData);
    redis.set("Redis_worldbuffData", buffData, "EX", 60 * 60 * 10);
    res.status(200).json({ message: "월법" });
  } else {
    console.log(`키가 일치하지 않습니다.`);
    res.status(500).send("Inconsistency key");
  }
});

app.get("/api/worldbuff", async (req, res) => {
  console.log("월드버프 요청됨");
  const wouldbuff = await redis.get("Redis_worldbuffData");
  res.status(200).json(wouldbuff);
  return;
});

app.listen(port, () => {
  console.log(`server running on ${port}`);
});
