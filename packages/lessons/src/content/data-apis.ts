import type { Lesson } from "../types";

export const dataApis: Lesson[] = [
  {
    id: "api-1",
    skillId: "data-apis",
    title: "Talking to APIs",
    summary: "How apps ask servers for data.",
    hook: "Almost every app feature - login, payments, weather - is the frontend asking an API for something.",
    exercises: [
      {
        id: "api-1-match",
        type: "match",
        difficulty: 1,
        prompt: "Match each action to the request type an API would use.",
        categories: [
          { id: "get", label: "GET (read)" },
          { id: "post", label: "POST (create)" },
          { id: "delete", label: "DELETE (remove)" },
        ],
        items: [
          { id: "load", label: "Load the list of recipes" },
          { id: "add", label: "Submit a new recipe" },
          { id: "rm", label: "Remove a recipe" },
          { id: "view", label: "Open one recipe's page" },
          { id: "signup", label: "Create a new account" },
        ],
        solution: { load: "get", add: "post", rm: "delete", view: "get", signup: "post" },
        explanation:
          "GET reads data without changing anything, POST creates something new, DELETE removes. Using the right verb makes your API predictable - and means a harmless GET can never accidentally delete data.",
      },
      {
        id: "api-1-bug",
        type: "bug_hunt",
        difficulty: 2,
        prompt:
          "This page shows a blank list sometimes. Tap the line that uses data before it has arrived.",
        filename: "RecipeList.tsx",
        lines: [
          { id: "l1", label: "function RecipeList() {" },
          { id: "l2", label: "  const [recipes, setRecipes] = useState();" },
          {
            id: "l3",
            label:
              "  useEffect(() => { fetch('/api/recipes').then(r => r.json()).then(setRecipes); }, []);",
          },
          {
            id: "l4",
            label: "  return <ul>{recipes.map(r => <li key={r.id}>{r.name}</li>)}</ul>;",
          },
          { id: "l5", label: "}" },
        ],
        solution: ["l4"],
        explanation:
          "On the first render recipes is undefined, so .map crashes. Start with an empty list (useState([])) or show a loading state until the data arrives - network requests are never instant.",
      },
      {
        id: "api-1-seq",
        type: "sequence",
        difficulty: 2,
        prompt: "Order a safe way to add a new API-backed feature.",
        items: [
          { id: "shape", label: "Decide what data goes in and comes out" },
          { id: "endpoint", label: "Build the endpoint and try it on its own" },
          { id: "errors", label: "Handle failures (empty, error, offline)" },
          { id: "ui", label: "Connect the screen to the endpoint" },
          { id: "test", label: "Test the whole flow end to end" },
        ],
        solution: ["shape", "endpoint", "errors", "ui", "test"],
        explanation:
          "Proving the endpoint works by itself first means that when the screen misbehaves, you know the problem is in the screen. Planning failure states early avoids the blank-page bugs.",
      },
      {
        id: "api-1-scn",
        type: "scenario",
        difficulty: 3,
        prompt: "Which is the safest way to handle a weather API key?",
        context: "Your app calls a paid weather API that bills per request.",
        options: [
          {
            id: "front",
            label: "Put the key in the frontend code so it's easy to use",
            feedback: "Anyone can read frontend code, copy the key and run up your bill.",
          },
          {
            id: "proxy",
            label: "Call the API from your backend, keeping the key in an environment variable",
            feedback:
              "Right: the frontend asks your backend, your backend uses the secret key, and you can add rate limits.",
          },
          {
            id: "comment",
            label: "Hide the key in a code comment",
            feedback: "Comments ship with the code. Obscurity isn't security.",
          },
        ],
        solution: "proxy",
        explanation:
          "Keys for paid or private APIs belong on the server. Your backend becomes a gatekeeper that can authenticate users and limit usage - this is also how AI features should be wired in.",
      },
    ],
  },
];
