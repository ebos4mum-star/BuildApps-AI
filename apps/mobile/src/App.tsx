import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { LearnScreen } from "./screens/Learn";
import { LessonScreen } from "./screens/Lesson";
import { LoginScreen } from "./screens/Login";
import { NewProject, ProjectDetail, ProjectsList } from "./screens/Projects";
import { Button } from "./components/ui";
import { supabase } from "./lib/session";
import { c } from "./theme";

type Screen =
  | { name: "learn" }
  | { name: "lesson"; id: string }
  | { name: "projects" }
  | { name: "new" }
  | { name: "project"; id: string };

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "learn" });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  if (authed === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const tab = (name: "learn" | "projects", label: string) => (
    <Text
      onPress={() => setScreen(name === "learn" ? { name: "learn" } : { name: "projects" })}
      accessibilityRole="tab"
      accessibilityState={{ selected: screen.name === name }}
      style={{
        color: screen.name === name ? c.text : c.muted,
        fontWeight: "900",
        padding: 12,
        fontSize: 16,
      }}
    >
      {label}
    </Text>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      {!authed ? (
        <LoginScreen />
      ) : (
        <>
          {screen.name !== "lesson" && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderBottomColor: c.line,
                borderBottomWidth: 2,
              }}
            >
              {tab("learn", "Learn")}
              {tab("projects", "Projects")}
              <View style={{ flex: 1 }} />
              <View style={{ width: 110, paddingRight: 8 }}>
                <Button title="Sign out" kind="secondary" onPress={() => supabase.auth.signOut()} />
              </View>
            </View>
          )}
          <View style={{ flex: 1 }}>
            {screen.name === "learn" && (
              <LearnScreen
                refreshKey={refresh}
                onOpenLesson={(id) => setScreen({ name: "lesson", id })}
              />
            )}
            {screen.name === "lesson" && (
              <LessonScreen
                lessonId={screen.id}
                onExit={() => {
                  setRefresh((r) => r + 1);
                  setScreen({ name: "learn" });
                }}
              />
            )}
            {screen.name === "projects" && (
              <ProjectsList
                onNew={() => setScreen({ name: "new" })}
                onOpen={(id) => setScreen({ name: "project", id })}
              />
            )}
            {screen.name === "new" && (
              <NewProject onCreated={(id) => setScreen({ name: "project", id })} />
            )}
            {screen.name === "project" && <ProjectDetail id={screen.id} />}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
