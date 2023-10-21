require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const axios = require("axios");
const qs = require("querystring");
const cache = require("memory-cache");

app.use(express.json());
app.use(
  cors({
    origin: `http://localhost:3000`,
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

app.get("/search", async (req, res) => {
  await getAccessToken();
  const accessToken = cache.get("token");
  const charactername = req.query.charactername;
  const cacheInfo = cache.get(charactername);
  const encodedCharacterName = encodeURIComponent(charactername);
  if (!cacheInfo) {
    console.log(`${charactername} 캐시없음`);
    try {
      const response = await axios.get(
        `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedCharacterName}`,
        {
          params: {
            namespace: "profile-classic1x-kr",
            locale: "ko_kr",
            access_token: accessToken,
          },
        }
      );
      if (res.status === 404) {
        res.status(500).json(error);
        return;
      }
      console.log(`${charactername} 호출완료`);
      cache.put(charactername, response.data, 5 * 60 * 1000);
      res.status(200).json(response.data);
      return;
    } catch (error) {
      console.log(`${charactername} 호출실패`);
      res.status(500).json(error);
      return;
    }
  } else {
    console.log(`${charactername}캐시존재`);
    res.status(200).json(cacheInfo);

    return;
  }
  res.status(200).json(cacheInfo);
  return;
});

app.get("/guild", async (req, res) => {
  try {
    await getAccessToken();
  } catch (err) {
    console.log("길드조회중토큰조회실패");
    res.status(500).send(err);
  }
  const accessToken = cache.get("token");
  const cachedGuildMemberCount = cache.get("guildMemberCount");
  if (!cachedGuildMemberCount) {
    console.log(`길드인원 캐시없음`);
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
      const memberCount = response.data.member_count;
      cache.put("guildMemberCount", memberCount, 1 * 60 * 1000);
    } catch (error) {
      console.log("길드 조회실패");
      return res.status(500).json(error);
    }
  }
  console.log(`길드인원정보 캐시존재`);
  res.status(200).json(cachedGuildMemberCount);
});

app.get("/equipment", async (req, res) => {
  await getAccessToken();
  const accessToken = cache.get("token");
  const charactername = req.query.charactername;
  const encodedCharacterName = encodeURIComponent(charactername);
  console.log(`${charactername} equipment요청됨`);
  if (!cache.get(`equipment_${charactername}`)) {
    console.log(`${charactername} 장비데이터 캐시없음`);
    try {
      const response = await axios.get(
        `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodedCharacterName}/equipment`,
        {
          params: {
            namespace: "profile-classic1x-kr",
            locale: "ko_kr",
            access_token: accessToken,
          },
        }
      );
      console.log(`${charactername}장비 요청성공`);
      cache.put(`equipment_${charactername}`, response.data, 5 * 60 * 1000);
    } catch (error) {
      console.log(error);
      res.status(500).json(error);
    }
  } else console.log(`${charactername} 장비아이템 캐시존재`);
  res.status(200).json(cache.get(`equipment_${charactername}`));
});

//

app.get("/media", async (req, res) => {
  const mediaid = req.query.mediaid;
  if (!mediaid) {
    res.status(400).send("mediaid 없음");
    return;
  }
  await getAccessToken();
  const accessToken = cache.get("token");
  const imgCache = cache.get(`mediaid_${mediaid}`);
  if (!imgCache) {
    console.log(`mediaid_${mediaid} 캐시없음`);
    let imgUrl;
    console.log(`mediaid = ${mediaid} 요청됨`);
    try {
      const response = await axios.get(
        `https://kr.api.blizzard.com/data/wow/media/item/${mediaid}`,
        {
          params: {
            namespace: "static-1.14.4_50753-classic1x-kr",
            access_token: accessToken,
          },
        }
      );
      imgUrl = response.data.assets[0].value;
      console.log(imgUrl);
    } catch (error) {
      console.log(error);
      res.status(500).json(error);
      return;
    }
    cache.put(`mediaid_${mediaid}`, imgUrl, 24 * 60 * 60 * 1000);
    console.log(`${mediaid} 캐시생성됨`);
  }
  res.status(200).send(imgCache);
});

app.get("/statistics", async (req, res) => {
  await getAccessToken();
  const accessToken = cache.get("token");
  const charactername = req.query.charactername;
  console.log(`${charactername}/stasistics`);
  try {
    const response = await axios.get(
      `https://kr.api.blizzard.com/profile/wow/character/makgora/${encodeURIComponent(
        charactername
      )}/statistics`,
      {
        params: {
          access_token: accessToken,
          locale: "ko_KR",
          namespace: "profile-classic1x-kr",
        },
      }
    );
    res.status(200).json(response.data);
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

app.listen(5000, () => {
  console.log(`server running on 5000`);
});
