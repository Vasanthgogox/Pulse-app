// =============================================================================
// RPC LIVE EXPERIMENT — Box & Blender Metaphor
// =============================================================================
//
// Imagine:
//   - Your score is a BOX sitting on your desk at home (the CLIENT).
//   - The kitchen that can upgrade that score is far away (the SERVER).
//   - A delivery guy carries your box to the kitchen and brings it back (RPC).
//
// RPC = Remote Procedure Call
//   "Remote"  = happens somewhere else (the server)
//   "Procedure" = a function / recipe
//   "Call"    = you ask for it to run
//
// You are NOT really talking over a network here. This file FAKE-simulates
// a client and a server in one JavaScript file so you can see the idea.
//
 // Run it:  node rpc_test.js
// =============================================================================


// -----------------------------------------------------------------------------
// 1. THE SERVER (The kitchen far away)
// -----------------------------------------------------------------------------
// This object is our "remote kitchen." Each key is a dish on the menu
// (a function the server is willing to run for you). The client cannot
 // invent new dishes — only order what is already on this menu.

const remoteServer = {
  // Recipe name: addBonusPoints
  // What it does: takes whatever score you send, adds 100, and returns it.
  // Why: the "heavy lifting" lives on the server, not on your laptop.
  addBonusPoints: (currentScore) => {
    // currentScore = the number that arrived inside the delivery box
    return currentScore + 100; // cook the result, put it back in the box
  },

  // --- Experiment 2 (Server Upgrade): uncomment / keep this second recipe ---
  // After the kitchen learns a new recipe, the client can order it by name.
  doubleScore: (currentScore) => {
    return currentScore * 2; // doubles whatever score arrived
  },
};


// -----------------------------------------------------------------------------
// 2. THE RPC SYSTEM (The delivery guy)
 // -----------------------------------------------------------------------------
 // This function is the "middleman."
 // The client never touches remoteServer directly in a real system —
 // it hands a request to the delivery guy, who finds the right kitchen recipe.
 //
 // functionName = which dish to order (string, like "addBonusPoints")
 // dataBox      = the payload / ingredients (here: your score number)
 //
 // How it works step by step:
 //   1. Log that we are "sending" data (pretend network trip)
 //   2. Look up remoteServer[functionName] — find the recipe by name
 //   3. Call that recipe with dataBox
 //   4. Return whatever the kitchen cooked

function rpcCall(functionName, dataBox) {
  console.log(`[RPC] Sending data '${dataBox}' to remote server...`);

  // remoteServer[functionName] uses the STRING name to pick a function.
  // Example: if functionName is "addBonusPoints", this becomes
  //          remoteServer.addBonusPoints(dataBox)
  //
  // If the name is wrong (e.g. "makePizza"), remoteServer["makePizza"]
  // is undefined, and calling it CRASHES — that is Experiment 1.
  const result = remoteServer[functionName](dataBox);

  // Hand the cooked answer back to the client
  return result;
}


// -----------------------------------------------------------------------------
 // 3. THE CLIENT (You, at home)
 // -----------------------------------------------------------------------------
 // myScore is your LOCAL box. Only your machine knows this value until
 // you choose to send it through RPC.

let myScore = 10; // start with 10 points in the local box
console.log("Starting local score:", myScore);

 // You ask the delivery guy: "Please run addBonusPoints on the server,
 // and here is my score box." When he returns, overwrite your local box
 // with the new value.
 //
 // --- Experiment 1 (Wrong Order): change "addBonusPoints" to "makePizza" ---
 //     Expected: crash — makePizza is not on the server's menu.
 //
 // --- Experiment 2 (Server Upgrade): use "doubleScore" instead -------------
 //     Expected: 10 becomes 20 (if you call doubleScore on the starting score).

myScore = rpcCall("addBonusPoints", myScore);

console.log("Updated local score after RPC:", myScore);

 // Expected output for the default (addBonusPoints) run:
 //   Starting local score: 10
 //   [RPC] Sending data '10' to remote server...
 //   Updated local score after RPC: 110
 //
 // Why 110? Local box was 10. Server recipe added 100. Delivery brought 110 back.
 // Your local myScore is then replaced with that returned number.


 // =============================================================================
 // HOW TO RUN THE TWO EXPERIMENTS
 // =============================================================================
 //
 // Experiment 1 — Wrong Order Test
 //   Change the client line to:
 //     myScore = rpcCall("makePizza", myScore);
 //   Lesson: RPC only works for procedures the server already exposes.
 //
 // Experiment 2 — Server Upgrade Test
 //   Keep doubleScore on remoteServer (already included above), then change to:
 //     myScore = rpcCall("doubleScore", myScore);
 //   Lesson: once the server adds a new procedure, the client can call it by name.
 //
 // Tip: try one experiment at a time. Reset myScore thinking between runs.
 // =============================================================================
