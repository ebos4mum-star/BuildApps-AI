import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Button, s } from "../components/ui";
import { supabase } from "../lib/session";

export function LoginScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } =
        mode === "up"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (mode === "up" && !("session" in data && data.session))
        setMsg("Check your email to confirm your account, then sign in.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 56, textAlign: "center" }}>🤖</Text>
      <Text style={[s.h1, { textAlign: "center" }]} accessibilityRole="header">
        {mode === "up" ? "Create your account" : "Welcome back"}
      </Text>
      <Text style={s.label}>Email</Text>
      <TextInput
        accessibilityLabel="Email"
        style={s.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Text style={s.label}>Password</Text>
      <TextInput
        accessibilityLabel="Password"
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === "up" ? "new-password" : "current-password"}
      />
      {msg && (
        <View style={s.err} accessibilityRole="alert">
          <Text style={s.text}>{msg}</Text>
        </View>
      )}
      <Button
        title={mode === "up" ? "Sign up" : "Sign in"}
        disabled={busy || !email || password.length < 8}
        onPress={submit}
      />
      <Button
        title={mode === "up" ? "I have an account" : "Create account"}
        kind="secondary"
        onPress={() => setMode(mode === "up" ? "in" : "up")}
      />
    </ScrollView>
  );
}
