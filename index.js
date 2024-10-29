const CONFIG = require("./config.json");

const express = require("express");
const { engine } = require('express-handlebars');
const app = express();
const fs = require("fs");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const http = require("http");

// Set up rate limiter
const RateLimit = require('express-rate-limit')
const limiter = RateLimit({
  windowMs: 60*1000, // 1 minute time
  max: 100 // 100 requests
});

app.use(express.json());
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.use("/static", express.static("public"));
app.use(limiter);

const DB = require("./services/database.service.js");

app.use("/downloads", require("./routes/admin.js"))

app.get("/", async (req, res) => {
  res.render("index", {
    title: req.hostname + " - Showup",
  });
});

app.get("/imprint", async (req, res) => {
  res.render("imprint", {
    title: req.hostname + " - Imprint",
  });
});

app.get("/details/:uuid", async (req, res) => {
  const uuid = req.params.uuid;
  if(!uuid){
        return res.redirect("/")
    }

  DB.query('SELECT * FROM downloads WHERE uuid = ?', [uuid], async (err, result) => {
    if(err){
      return res.json(err);
    }

    const url = req.protocol + "://" + req.get("host");
    const addon = await getAddonByUUID(url, uuid)

    if(addon.error){
        return res.redirect("/")
    }
    if(!addon.addon){
        return res.redirect("/")
    }
    let downloads = 0;
    if(result.length > 0){
      downloads = result[0].downloads;
    }
    res.render("details", {
        layout: "details",
        title: req.hostname + " - Details",
        uuid,
        author: addon.addon.author,
        name:addon.addon.name,
        desc:addon.addon.description,
        isVerified: addon.addon.verified,
        imageURL: `https://dl.labymod.net/latest/addons/${uuid}/icon.png`,
        downloads
    });
  });
});

app.get("/privacy", async (req, res) => {
  res.render("privacy", {
    title: req.hostname + " - Privacy Policy",
  });
});

app.get("/api/offical", async (req, res) => {
  const addons = {
    18: [],
    112: [],
    116: [],
  };
  let rawdata = fs.readFileSync("./public/addons.json");
  let result = JSON.parse(rawdata);

  for (const key of Object.keys(result.addons)) {
    const addon = result.addons[key];
    for (const a of addon) {
      addons[key].push({
        name: a.name,
        uuid: a.uuid,
        author: a.author,
        description: a.description,
        dl: `https://dl.labymod.net/latest/addons/${a.uuid}/icon.png`,
        verified: a.verified
      });
    }
  }
  res.status(200).json({
    time: result.time,
    addons: {
      18: addons["18"],
      112: addons["112"],
      116: addons["116"],
    },
  });
});
app.get("/download", async (req, res) => {
  const addonUuid = req.query.q;
  const url = req.protocol + "://" + req.get("host");
  const name = await getNameByUUID(url, addonUuid);

  if (!name.error) {

    DB.query('SELECT * FROM downloads WHERE uuid = ?', [addonUuid], (err, res) => {
      if(err){
        return console.error(err);
      }
      if(res.length > 0){
        const first = parseInt(res[0].downloads);
        DB.query('UPDATE downloads SET downloads = ? WHERE uuid = ?', [first + 1, addonUuid], (err, res) => {
          if(err){
            return console.error(err);
          }
        })
      }else{
        DB.query('INSERT INTO downloads (uuid, downloads) VALUES(?, ?)', [addonUuid, 1], (err, res) => {
          if(err){
            return console.error(err);
          }
        });
      }

    })
    download(
      `https://dl.labymod.net/latest/?file=${addonUuid}&a=1`,
      `./temp/${name.name}.jar`,
      (err) => {
        if (!err) {
          res.download(
            `${__dirname}/temp/${name.name}.jar`,
            `${name.name}.jar`,
            (err) => {
              if (err) {
                console.log(err);
              } else {
                fs.unlinkSync(`${__dirname}/temp/${name.name}.jar`);
              }
            }
          );
        }
      }
    );
  } else {
    res.redirect("/");
  }
});

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  const request = http.get(url, (response) => {
    if (response.statusCode !== 200) {
      return cb("Response status was " + response.statusCode);
    }
    response.pipe(file);
  });
  // close() is async, call cb after close completes
  file.on("finish", () => file.close(cb));

  // check for request error too
  request.on("error", (err) => {
    fs.unlink(dest);
    return cb(err.message);
  });

  file.on("error", (err) => {
    // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    return cb(err.message);
  });
}

async function getAddonByUUID(baseURL, uuid) {
  const res = await fetch(baseURL + "/api/offical");
  const text = await res.text();
  const json = JSON.parse(text).addons;

  if (uuid) {
    let resAddon = undefined;
    for (const key of Object.keys(json)) {
      for (const o of json[key]) {
        if (o.uuid === uuid) {
          resAddon = o;
        }
      }
    }
    return {
      addon: resAddon,
    };
  } else {
    return {
      error: "UUID not defined",
    };
  }
}

async function getNameByUUID(baseURL, uuid) {
  const res = await fetch(baseURL + "/api/offical");
  const text = await res.text();
  const json = JSON.parse(text).addons;

  if (uuid) {
    let resName = undefined;
    for (const key of Object.keys(json)) {
      for (const o of json[key]) {
        if (o.uuid === uuid) {
          resName = o.name;
        }
      }
    }
    return {
      name: resName,
    };
  } else {
    return {
      error: "UUID not defined",
    };
  }
}

app.get("*", function (req, res) {
  res.redirect("/");
});

app.listen(CONFIG.SERVER.DEVPORT, () => {
  console.log(`Server listening on port: ${CONFIG.SERVER.DEVPORT}.`);
  console.log(`SITE: http://localhost:${CONFIG.SERVER.DEVPORT}`);
});