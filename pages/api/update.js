import { generateBuildId } from "@/next.config";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ON/OFF SWITCHES
const POST_TO_CONSOLE = false;
const POST_TO_GOOGLE = true;
const POST_TO_SLACK = true;

// ENVIRONMENT VARIABLES
// Gmail account that edits the spreadsheet
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Private key used to authenticate the Gmail account
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
// ID of the spreadsheet we're posting to
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
// Cookie used to authenticate Github blackbird requests
const GITHUB_COOKIE = process.env.GITHUB_COOKIE;
// Slack bot token used to post messages in Slack
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

// QUERIES
// stats[sheet][column] = value
const getStats = async () => ({
  githubProjectCounts: {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    o1js: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+o1js"
    ),
    SnarkyJS: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+snarkyjs"
    ),
    Circom: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+snarkjs"
    ),
    Leo: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29program%5C.json%24%2F+aleo"
    ),
    Noir: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29Nargo%5C.toml%24%2F"
    ),
    Cairo: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29Scarb%5C.toml%24%2F"
    ),
    RISC0: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29cargo.toml%24%2F+risc0-zkvm"
    ),
    ZoKrates: await getNumberOfBlackbirdResults(
      "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+zokrates-js"
    ),
    Gnark: await getNumberOfBlackbirdResults(
      "%2Fconsensys%5C%2Fgnark%5C%2Ffrontend%2F"
    ),
    "o1js+SnarkyJS": "=C:C+D:D",
  },
  npmDownloads: {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    o1js: await getNumberOfNpmDownloads("o1js"),
    SnarkyJS: await getNumberOfNpmDownloads("snarkyjs"),
    "o1js+SnarkyJS": "=C:C+D:D",
  },
  deployedZkApps: {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    ZkAppAccounts: await getNumberOfDeployedZkApps(),
  },
});

const getNumberOfBlackbirdResults = (query) =>
  fetch("https://github.com/search/blackbird_count?q=" + query, {
    headers: new Headers({
      Accept: "application/json",
      Cookie: GITHUB_COOKIE,
    }),
    method: "GET",
  }).then((res) =>
    res.json().then(
      (data) => data.count,
      (error) => "INVALID_RESPONSE"
    )
  );

const getNumberOfNpmDownloads = (query) =>
  fetch("https://api.npmjs.org/downloads/point/last-day/" + query).then((res) =>
    res.json().then(
      (data) => data.downloads,
      (error) => "INVALID_RESPONSE"
    )
  );

const getNumberOfDeployedZkApps = () =>
  fetch("https://berkeley.minaexplorer.com/all-accounts/zkapps?length=1").then(
    (res) =>
      res.json().then(
        (data) => data.recordsTotal,
        (error) => "INVALID_RESPONSE"
      )
  );

// SLACK MESSAGES
// Message in #dev-relations channel that pings @devrel_guardian and @sdk_guardian
const slackInvalidResponseMessage = {
  channel: "C038UN20DK8",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":frowning: The KPI dashboard recieved an invalid response from one of the API endpoints it queried. <!subteam^S062B49LKC6> <!subteam^S0448B97L22>",
      },
    },
  ],
};

const formatStatsToSlackBlockKit = (heading, stats) => {
  let ignoredKeys = ["UnixTime", "Time", "o1js+SnarkyJS"];
  let sectionBody = `*${heading}*\n`;

  for (const [key, value] of Object.entries(stats)) {
    if (!ignoredKeys.includes(key)) {
      sectionBody += `>${key}: ${value}\n`;
    }
  }

  return sectionBody;
};

const createSlackLogMessage = (stats) => {
  const headings = ["Github Projects", "NPM Downloads", "Berkeley"];

  const blocks = Object.keys(stats).forEach((stats, index) => {
    console.log(stats);
    const sectionBody = formatStatsToSlackBlockKit(headings[index], stats);

    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: sectionBody,
      },
    };
  });

  // Message in #kpi-dashboard-log channel
  return { channel: "C06EC25FHM0", blocks };
};

const postMessageToSlack = (message) =>
  fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    }),
    body: JSON.stringify(message),
  });

// Vercel API handler (a cron job runs this every day)
export default async function handler(req, res) {
  // GET STATS
  // stats[sheet][column] = value
  const stats = await getStats();

  // POST STATS TO PLACES
  if (POST_TO_CONSOLE) {
    console.log(stats);
  }

  if (POST_TO_SLACK) {
    // Log stats to #kpi-dashboard-log channel
    const slackLogMessage = createSlackLogMessage(stats);
    console.log(slackLogMessage);
    let res = await postMessageToSlack(slackLogMessage);

    // Send Slack message to #dev-relations if an API endpoints returns "INVALID_RESPONSE"
    if (Object.values(stats).includes("INVALID_RESPONSE")) {
      await postMessageToSlack(slackInvalidResponseMessage);
    }
  }

  if (POST_TO_GOOGLE) {
    // Initialize Auth - see https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
    const spreadsheet = new GoogleSpreadsheet(GOOGLE_SPREADSHEET_ID);
    await spreadsheet.useServiceAccountAuth({
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join("\n"),
    });

    // Load sheets
    await spreadsheet.loadInfo();
    const githubProjectCountSheet = spreadsheet.sheetsById[0];
    const npmDownloadSheet = spreadsheet.sheetsById[893481103];
    const deployedZkAppSheet = spreadsheet.sheetsById[2060459223];

    // Add new rows
    await githubProjectCountSheet.addRow(stats.githubProjectCounts);
    await npmDownloadSheet.addRow(stats.npmDownloads);
    await deployedZkAppSheet.addRow(stats.deployedZkApps);
  }

  // Return stats object (just because :)
  res.status(200).json(stats);
}
