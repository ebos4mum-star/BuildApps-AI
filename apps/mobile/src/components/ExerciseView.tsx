import { Pressable, Text, View } from "react-native";
import {
  blanksOf,
  chooseOption,
  clearBlank,
  moveItem,
  pickItem,
  placeItem,
  tapWord,
  toggleLine,
  unplaceItem,
  type ClientExercise,
  type Draft,
  type GradeResult,
} from "@buildapps/lessons";
import { c } from "../theme";
import { s } from "./ui";

interface Props {
  exercise: ClientExercise;
  draft: Draft;
  setDraft: (d: Draft) => void;
  result: GradeResult | null;
}

/** Touch-first versions of the same five exercise types (state logic shared with web via @buildapps/lessons). */
export function ExerciseView({ exercise, draft, setDraft, result }: Props) {
  const locked = result !== null;
  const wrong = new Set(result && !result.correct ? result.wrongIds : []);
  const tone = (id: string) =>
    locked
      ? wrong.has(id)
        ? { borderColor: c.coral, backgroundColor: "#43202c" }
        : { borderColor: c.mint, backgroundColor: "#0f3b32" }
      : null;
  const pill = (selected = false) => ({
    backgroundColor: selected ? "#1d3a66" : c.surface,
    borderColor: selected ? c.sky : c.line,
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
  });

  return (
    <View>
      <Text style={s.h2} accessibilityRole="header">
        {exercise.prompt}
      </Text>
      {exercise.context ? (
        <View
          style={{
            borderLeftColor: c.sky,
            borderLeftWidth: 5,
            backgroundColor: "#181334",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Text style={s.muted}>{exercise.context}</Text>
        </View>
      ) : null}

      {exercise.type === "sequence" && draft.type === "sequence" && (
        <View>
          <Text style={s.muted}>Use the arrows to put the steps in order.</Text>
          {draft.order.map((id, i) => {
            const label = exercise.items.find((x) => x.id === id)?.label ?? id;
            return (
              <View
                key={id}
                style={[pill(), { flexDirection: "row", alignItems: "center" }, tone(id)]}
              >
                <Text style={[s.text, { flex: 1 }]} accessibilityLabel={`Step ${i + 1}: ${label}`}>
                  {i + 1}. {label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${label} up`}
                  disabled={locked || i === 0}
                  onPress={() => setDraft(moveItem(draft, i, i - 1))}
                  style={{ padding: 10, opacity: locked || i === 0 ? 0.3 : 1 }}
                >
                  <Text style={s.text}>▲</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${label} down`}
                  disabled={locked || i === draft.order.length - 1}
                  onPress={() => setDraft(moveItem(draft, i, i + 1))}
                  style={{ padding: 10, opacity: locked || i === draft.order.length - 1 ? 0.3 : 1 }}
                >
                  <Text style={s.text}>▼</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {exercise.type === "bug_hunt" && draft.type === "bug_hunt" && (
        <View>
          <Text style={s.muted}>
            Tap{" "}
            {exercise.bugCount === 1
              ? "the line with the bug"
              : `the ${exercise.bugCount} buggy lines`}
            .
          </Text>
          <View
            style={{
              backgroundColor: "#0c0920",
              borderColor: c.line,
              borderWidth: 2,
              borderRadius: 14,
              overflow: "hidden",
              marginTop: 8,
            }}
          >
            <Text style={[s.muted, { padding: 8, backgroundColor: "#181334" }]}>
              {exercise.filename}
            </Text>
            {exercise.lines.map((l, i) => {
              const sel = draft.selected.includes(l.id);
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`Line ${i + 1}: ${l.label}`}
                  disabled={locked}
                  onPress={() => setDraft(toggleLine(draft, l.id, exercise.bugCount))}
                  style={[
                    { flexDirection: "row", padding: 8, gap: 10 },
                    sel && { backgroundColor: "rgba(255,200,74,0.2)" },
                    locked && wrong.has(l.id) && { backgroundColor: "#43202c" },
                    locked && sel && result?.correct && { backgroundColor: "#0f3b32" },
                  ]}
                >
                  <Text style={{ color: "#6b64a8", width: 22, textAlign: "right" }}>{i + 1}</Text>
                  <Text style={{ color: c.text, flex: 1, fontFamily: "Courier", fontSize: 13 }}>
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {exercise.type === "match" && draft.type === "match" && (
        <View>
          <Text style={s.muted}>
            Tap an item, then tap the box it belongs in. Tap a placed item to take it back.
          </Text>
          {exercise.categories.map((cat) => (
            <Pressable
              key={cat.id}
              accessibilityRole="button"
              accessibilityLabel={`Box: ${cat.label}`}
              disabled={locked}
              onPress={() => draft.picked && setDraft(placeItem(draft, draft.picked, cat.id))}
              style={{
                borderColor: draft.picked ? c.sun : c.line,
                borderWidth: 3,
                borderStyle: "dashed",
                borderRadius: 16,
                padding: 10,
                marginVertical: 6,
                backgroundColor: "#181334",
                minHeight: 70,
              }}
            >
              <Text style={{ color: c.sky, fontWeight: "900", fontSize: 12 }}>
                {cat.label.toUpperCase()}
              </Text>
              {exercise.items
                .filter((i) => draft.placements[i.id] === cat.id)
                .map((i) => (
                  <Pressable
                    key={i.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${i.label} (placed, tap to remove)`}
                    disabled={locked}
                    onPress={() =>
                      setDraft(
                        draft.picked && draft.picked !== i.id
                          ? placeItem(draft, draft.picked, cat.id)
                          : unplaceItem(draft, i.id),
                      )
                    }
                    style={[pill(), tone(i.id)]}
                  >
                    <Text style={s.text}>{i.label}</Text>
                  </Pressable>
                ))}
            </Pressable>
          ))}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {exercise.items
              .filter((i) => !draft.placements[i.id])
              .map((i) => (
                <Pressable
                  key={i.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: draft.picked === i.id }}
                  onPress={() => setDraft(pickItem(draft, i.id))}
                  style={pill(draft.picked === i.id)}
                >
                  <Text style={s.text}>{i.label}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      )}

      {exercise.type === "scenario" && draft.type === "scenario" && (
        <View accessibilityRole="radiogroup">
          {exercise.options.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: draft.optionId === o.id }}
              disabled={locked}
              onPress={() => setDraft(chooseOption(draft, o.id))}
              style={[
                pill(draft.optionId === o.id),
                locked &&
                  draft.optionId === o.id &&
                  (result?.correct
                    ? { borderColor: c.mint, backgroundColor: "#0f3b32" }
                    : { borderColor: c.coral, backgroundColor: "#43202c" }),
              ]}
            >
              <Text style={s.text}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {exercise.type === "word_bank" && draft.type === "word_bank" && (
        <View>
          <Text style={s.muted}>
            Tap a word to fill the next blank. Tap a filled blank to remove it.
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              marginVertical: 12,
            }}
          >
            {exercise.template.map((t, i) =>
              typeof t === "string" ? (
                <Text key={i} style={[s.text, { fontSize: 18, lineHeight: 40 }]}>
                  {t}
                </Text>
              ) : (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  disabled={locked}
                  accessibilityLabel={
                    draft.fills[t.blank]
                      ? `Blank ${t.blank}: ${exercise.words.find((w) => w.id === draft.fills[t.blank])?.label} (tap to remove)`
                      : `Empty blank ${t.blank}`
                  }
                  onPress={() =>
                    draft.fills[t.blank]
                      ? setDraft(clearBlank(draft, t.blank))
                      : setDraft({ ...draft, focusBlank: t.blank })
                  }
                  style={[
                    {
                      minWidth: 90,
                      borderWidth: 2,
                      borderRadius: 10,
                      borderColor: draft.focusBlank === t.blank ? c.sun : c.sky,
                      borderStyle: draft.fills[t.blank] ? "solid" : "dashed",
                      paddingHorizontal: 10,
                      marginHorizontal: 4,
                      backgroundColor: draft.fills[t.blank] ? "#1d3a66" : "#181334",
                    },
                    tone(t.blank),
                  ]}
                >
                  <Text style={[s.text, { fontSize: 18, lineHeight: 34, textAlign: "center" }]}>
                    {exercise.words.find((w) => w.id === draft.fills[t.blank])?.label ?? " "}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {exercise.words.map((w) => {
              const used = Object.values(draft.fills).includes(w.id);
              return (
                <Pressable
                  key={w.id}
                  accessibilityRole="button"
                  disabled={locked || used}
                  onPress={() => setDraft(tapWord(draft, exercise, w.id))}
                  style={[pill(), used && { opacity: 0.35 }]}
                >
                  <Text style={s.text}>{w.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {blanksOf(exercise).length === 0 ? null : null}
        </View>
      )}
    </View>
  );
}
