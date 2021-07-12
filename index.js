require('dotenv').config();

const SERVER_PORT = process.env.SERVER_PORT | 3000;

const express = require('express');
const exphbs = require("express-handlebars");
const app = express();
const bodyParser = require("body-parser");
const passport = require("passport")
const session = require("express-session")
const MySQLStore = require('express-mysql-session')(session);
const GitHubStrategy = require("passport-github2").Strategy
var mysql = require('mysql');

var options = {
	host:  process.env.DBHOST,
	port: process.env.PORT,
	user: process.env.USER,
	password: process.env.PASSWORD,
	database:  process.env.DATABASE
};

const connection = mysql.createConnection(options);
let connectionSuccess = false;
connection.connect(function(err) {
    if (err) {
      connectionSuccess = false;
      return;
    }
    connectionSuccess = true;
  });


const TABS = [
    {
        text: 'Dashboard',
        link: 'dashboard',
        allowed: []
    },
    {
        text: 'Team',
        link: 'team',
        allowed: [50, 100]
    }
]


const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;

passport.serializeUser(function(user, done) {
    done(null, user)
})
passport.deserializeUser(function(obj, done) {
    done(null, obj)
})

passport.use(
new GitHubStrategy({
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: GITHUB_CALLBACK_URL
    },(accessToken, refreshToken, profile, done)=> {
        return done(null, profile)
    })
)

app.use(bodyParser.json());
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.use('/static', express.static('public'));
app.use(bodyParser.urlencoded({extended: true})); 

app.use(
    session({ 
        secret: "%1(mBk3E9^JW8xA", 
        resave: false,
        saveUninitialized: false,
        store: new MySQLStore(options),
        cookie: {
            secure: app.get("env") === "production",
        }
    })
  )
  app.use(passport.initialize())
  app.use(passport.session())

  app.use((req, res, next) => {
    if(connectionSuccess && req.session.passport){
        var githubID = req.session.passport.user.id;
        connection.query("SELECT * FROM `team` WHERE githubID = " + githubID, (error, results, fields) => { // 46536197
            if (error){
                console.error(error)
            };
            var rank = 1;
            var rankName = ""
            if(results.length > 0){
                rank = results[0].rank;
                rankName = results[0].teamStatus;
            }
            req.session.rank = rank;
            req.session.rankName = rankName;
        })
    }
    next();
  });
app.get("/", async (req, res) => {
    console.log(req.session.rank)
    if(req.session.passport){
        res.render('index',{
            title: req.hostname + " - Showup",
            user: req.session.passport.user,
            photo: req.session.passport.user.photos[0].value,
            tabs: proccessTabs(TABS,req.session.rank)
        });
    }else{
        res.render('index',{
            title: req.hostname + " - Showup"
        });
    }
    
   

    //console.log(data);

})
app.get("/imprint", async (req, res) => {
    res.render('imprint',{
        title: req.hostname + " - Imprint"
    });
})
app.get("/privacy", async (req, res) => {
    res.render('privacy',{
        title: req.hostname + " - Privacy Policy"
    });
})


app.post("/api/upload", async (req, res) => {
})


app.get("/auth/github",
    passport.authenticate("github", { scope: ["repo:status"] }), /// Note the scope here
    function(req, res) { }
)

app.get('/logout', (req, res) => {
    if (req.session) {
      req.session.destroy(err => {
        if (err) {
          res.status(400).send('Unable to log out')
        }
        res.end()
      });
    }  
    res.redirect("/")
  })

app.get("/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/" }),
    function(req, res) {
      res.redirect("/")
    }
  )

app.get("/team", ensureAuthenticated, (req, res) => {
    res.render('team',{
        title: req.hostname + " - Dashboard"
    });
});

app.get("/dashboard", ensureAuthenticated, (req, res) => {
    if(req.session.passport){
        res.render('dashboard',{
            title: req.hostname + " - Dashboard",
            user: req.session.passport.user,
            photo: req.session.passport.user.photos[0].value
        });
    }else{
        res.render('dashboard',{
            title: req.hostname + " - Dashboard"
        });
    }
})



app.get("/api/inoffical", async (req, res) => {
    if(connectionSuccess){
        connection.query("SELECT * FROM inoffical", function (err, result) {
            if (err) throw err;
            var addons18 = [];
            var addons112 = [];
            var addons116 = [];
            for(var addon of result){
                if(addon.version == 18){
                    addons18.push({
                        "name": addon.name,
                        "uuid": addon.uuid,
                        "uploadedAt": addon.uploadedAt,
                        "status": addon.status,
                        "author": addon.author,
                        "description": addon.description,
                        "dl": addon.dl
                    })
                }else if(addon.version == 112){
                    addons112.push({
                        "name": addon.name,
                        "uuid": addon.uuid,
                        "uploadedAt": addon.uploadedAt,
                        "status": addon.status,
                        "author": addon.author,
                        "description": addon.description,
                        "dl": addon.dl
                    })
                }else if(addon.version == 116){
                    addons116.push({
                        "name": addon.name,
                        "uuid": addon.uuid,
                        "uploadedAt": addon.uploadedAt,
                        "status": addon.status,
                        "author": addon.author,
                        "description": addon.description,
                        "dl": addon.dl
                    })
                }
             
            }
            res.json({
                "addons": {
                    "18": addons18,
                    "112": addons112,
                    "116": addons116
                }
            })
        });
    }
})
app.listen(SERVER_PORT, ()=>{
    console.log(`Server listening on port: ${SERVER_PORT}.`);
    console.log(`SITE: http://localhost:${SERVER_PORT}`);
}) 










function ensureAuthenticated(req, res, next) {
    var path = req.originalUrl.replace("/", "");
    var allowed = isAllowed(path, req.session.rank);
    if (req.isAuthenticated() && allowed) {
      return next()
    }

    res.redirect("/")
  }
function isAllowed(tab, rank){
    var allowed = false;
    for(var t of TABS){
        if(t.link === tab){
            if(t.allowed.length > 0){
                if(t.allowed.includes(rank)){
                    allowed = true;
                }
            }else{
                allowed = true;
            }
        }
    }
    return allowed;
}

function proccessTabs(tabs, rank){
    var visableTABS = [];
    for(var tab of tabs){
        if(tab.allowed.length > 0){
            if(tab.allowed.includes(rank)){
                visableTABS.push(tab)
            }
        }else{
              visableTABS.push(tab)
        }

    }
    return visableTABS;
}