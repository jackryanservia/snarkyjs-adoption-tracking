import { generateBuildId } from "@/next.config";
import { GoogleSpreadsheet } from "google-spreadsheet";

// TODO:
// Organize (this is a big mess!) (Maybe orgarize by what it touching).
// Pull all env variables up to top
// Switch everything into one stats object (handle format and stuff later)

const POST_TO_CONSOLE = true;
const POST_TO_GOOGLE = true;
const POST_TO_SLACK = true;

// Initialize the sheet - doc ID is the long id in the sheets URL
const doc = new GoogleSpreadsheet(
  "1lsPIpLGWYiH2zA0MxKdI0asrRc4l9arHJbzxSOX4twU"
);

const queries = {
  o1js: "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+o1js",
  SnarkyJS: "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+snarkyjs",
  Circom: "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+snarkjs",
  Leo: "path%3A%2F%28%5E%7C%5C%2F%29program%5C.json%24%2F+aleo",
  Noir: "path%3A%2F%28%5E%7C%5C%2F%29Nargo%5C.toml%24%2F",
  Cairo: "path%3A%2F%28%5E%7C%5C%2F%29Scarb%5C.toml%24%2F",
  RISC0: "path%3A%2F%28%5E%7C%5C%2F%29cargo.toml%24%2F+risc0-zkvm",
  ZoKrates: "path%3A%2F%28%5E%7C%5C%2F%29package%5C.json%24%2F+zokrates-js",
  Gnark: "%2Fconsensys%5C%2Fgnark%5C%2Ffrontend%2F",
};

const githubHeaders = new Headers({
  Accept: "application/json",
  Cookie: process.env.GITHUB_COOKIE,
});

const slackHeaders = new Headers({
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
});

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

const getNumberOfResults = (query) =>
  fetch("https://github.com/search/blackbird_count?q=" + query, {
    headers: githubHeaders,
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

const postMessageToSlack = (message) =>
  fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: slackHeaders,
    body: JSON.stringify(message),
  });

const createSlackMessageSectionBody = (heading, stats) => {
  let sectionBody = `*${heading}*\n`;

  for (const [key, value] of Object.entries(stats)) {
    if (!IGNORED_KEYS.includes(key)) {
      sectionBody += `>${key}: ${value}\n`;
    }
  }

  return sectionBody;
};

const createSlackLogMessage = (
  adoptionStats,
  npmDownloadStats,
  deployedZkAppStats
) => {
  const statsObjects = [adoptionStats, npmDownloadStats, deployedZkAppStats];
  const headings = ["Github Projects", "NPM Downloads", "Berkeley"];

  const blocks = statsObjects.map((stats, index) => {
    const sectionBody = createSlackMessageSectionBody(headings[index], stats);

    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: sectionBody,
      },
    };
  });

  return { channel: "C06EC25FHM0", blocks };
};

export default async function handler(req, res) {
  // Fix this + queries object? How should people add or alter queries?
  const adoptionStats = {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    o1js: await getNumberOfResults(queries.o1js),
    SnarkyJS: await getNumberOfResults(queries.SnarkyJS),
    Circom: await getNumberOfResults(queries.Circom),
    Leo: await getNumberOfResults(queries.Leo),
    Noir: await getNumberOfResults(queries.Noir),
    Cairo: await getNumberOfResults(queries.Cairo),
    RISC0: await getNumberOfResults(queries.RISC0),
    ZoKrates: await getNumberOfResults(queries.ZoKrates),
    Gnark: await getNumberOfResults(queries.Gnark),
    "o1js+SnarkyJS": "=C:C+D:D",
  };

  const npmDownloadStats = {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    o1js: await getNumberOfNpmDownloads("o1js"),
    SnarkyJS: await getNumberOfNpmDownloads("snarkyjs"),
    "o1js+SnarkyJS": "=C:C+D:D",
  };

  const deployedZkAppStats = {
    UnixTime: Date.now(),
    Time: "=EPOCHTODATE(INDIRECT(ADDRESS(ROW(), COLUMN()-1, 4)), 2)",
    ZkAppAccounts: await getNumberOfDeployedZkApps(),
  };

  if (POST_TO_CONSOLE) {
    console.log(adoptionStats);
    console.log(npmDownloadStats);
    console.log(deployedZkAppStats);
  }

  if (POST_TO_SLACK) {
    const slackLogMessage = createSlackLogMessage(
      adoptionStats,
      npmDownloadStats,
      deployedZkAppStats
    );

    // Log spreadsheet input in Slack #kpi-dashboard-log channel
    await postMessageToSlack(slackLogMessage);

    // Send Slack alert if INVALID_RESPONSE
    if (
      Object.values(adoptionStats).includes("INVALID_RESPONSE") ||
      Object.values(npmDownloadStats).includes("INVALID_RESPONSE") ||
      Object.values(deployedZkAppStats).includes("INVALID_RESPONSE")
    ) {
      await postMessageToSlack(slackInvalidResponseMessage);
    }
  }

  if (POST_TO_GOOGLE) {
    // Initialize Auth - see https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication
    await doc.useServiceAccountAuth({
      // env var values are copied from service account credentials generated by google
      // see "Authentication" section in docs for more info
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join(
        "\n"
      ),
    });

    await doc.loadInfo(); // loads sheets
    const sheet = doc.sheetsById[0]; // the first sheet
    const npmDownloadSheet = doc.sheetsById[893481103];
    const deployedZkAppSheet = doc.sheetsById[2060459223];

    const newRow = await sheet.addRow({
      ...adoptionStats,
    });

    const newNpmDownloadRow = await npmDownloadSheet.addRow({
      ...npmDownloadStats,
    });

    const newDeployedZkAppStats = await deployedZkAppSheet.addRow({
      ...deployedZkAppStats,
    });
  }

  res.status(200).json({ adoptionStats, npmDownloadStats, deployedZkAppStats });
}
