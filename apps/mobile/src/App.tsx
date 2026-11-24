import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { LearnScreen } from "./screens/Learn";
import { LessonScreen } from "./screens/Lesson";
import { AdminScreen } from "./screens/Admin";
import { HelpScreen } from "./screens/Help";
import { SettingsScreen } from "./screens/Settings";
import { ExpertScreen } from "./screens/Expert";
import { LoginScreen } from "./screens/Login";
import { OnboardingScreen } from "./screens/Onboarding";
import { CheckScreen } from "./screens/Check";
import { NewProject, ProjectsList } from "./screens/Projects";
import { WorkspaceScreen } from "./screens/Workspace";
import { Button } from "./components/ui";
import { api, supabase } from "./lib/session";
import { c } from "./theme";

type Screen =
  | { name: "learn" }
  | { name: "onboarding" }
  | { name: "check"; skillId: string }
  | { name: "lesson"; id: string; returnProject?: string }
  | { name: "projects" }
  | { name: "expert" }
  | { name: "admin" }
  | { name: "help" }
  | { name: "settings" }
  | { name: "new" }
  | { name: "project"; id: string };

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "learn" });
  const [refresh, setRefresh] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      if (session) {
        // first run: offer the personalization questions once (skippable, editable later from Learn)
        api.myProfile().then(
          (p) => {
            if (!p) setScreen({ name: "onboarding" });
          },
          () => undefined,
        );
        api.adminMe().then(setAdmin, () => setAdmin(false)); // only decides whether to show the Admin tab
        api.notifications().then(
          (n) => setUnread(n.filter((x) => !x.readAt).length),
          () => setUnread(0),
        );
      } else setAdmin(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (authed === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const tab = (
    name: "learn" | "projects" | "expert" | "help" | "settings" | "admin",
    label: string,
  ) => (
    <Text
      onPress={() =>
        setScreen(
          name === "learn"
            ? { name: "learn" }
            : name === "projects"
              ? { name: "projects" }
              : name === "expert"
                ? { name: "expert" }
                : name === "help"
                  ? { name: "help" }
                  : name === "settings"
                    ? { name: "settings" }
                    : { name: "admin" },
        )
      }
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
          {screen.name !== "lesson" && screen.name !== "onboarding" && screen.name !== "check" && (
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
              {tab("expert", "Expert")}
              {tab("help", unread > 0 ? `Help (${unread})` : "Help")}
              {tab("settings", "Settings")}
              {admin ? tab("admin", "Admin") : null}
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
                onOpenOnboarding={() => setScreen({ name: "onboarding" })}
                onOpenCheck={(skillId) => setScreen({ name: "check", skillId })}
              />
            )}
            {screen.name === "onboarding" && (
              <OnboardingScreen
                onSkip={() => setScreen({ name: "learn" })}
                onDone={(p) => {
                  setRefresh((r) => r + 1);
                  setScreen(p.intent === "learn_first" ? { name: "learn" } : { name: "new" });
                }}
              />
            )}
            {screen.name === "check" && (
              <CheckScreen
                skillId={screen.skillId}
                onExit={() => {
                  setRefresh((r) => r + 1);
                  setScreen({ name: "learn" });
                }}
              />
            )}
            {screen.name === "lesson" && (
              <LessonScreen
                lessonId={screen.id}
                onExit={() => {
                  setRefresh((r) => r + 1);
                  // lessons opened from a project's finding return there, ready to fix and rescan
                  setScreen(
                    screen.returnProject
                      ? { name: "project", id: screen.returnProject }
                      : { name: "learn" },
                  );
                }}
              />
            )}
            {screen.name === "expert" && <ExpertScreen />}
            {screen.name === "admin" && <AdminScreen />}
            {screen.name === "help" && <HelpScreen onUnread={setUnread} />}
            {screen.name === "settings" && (
              <SettingsScreen onEditPlan={() => setScreen({ name: "onboarding" })} />
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
            {screen.name === "project" && (
              <WorkspaceScreen
                id={screen.id}
                onOpenLesson={(l) => setScreen({ name: "lesson", id: l, returnProject: screen.id })}
              />
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
