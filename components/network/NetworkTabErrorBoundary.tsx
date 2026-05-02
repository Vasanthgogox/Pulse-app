import Theme from "@/constants/Theme";
import React, { Component, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = { children: ReactNode };

type State = { hasError: boolean };

/**
 * Catches render errors on the Network tab so a flaky child doesn’t replace the whole app
 * with the root ErrorBoundary (“Connection error”).
 */
export class NetworkTabErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Network couldn’t finish loading</Text>
          <Text style={styles.msg}>
            A panel on this screen hit an unexpected error. Try again — if it keeps happening, pull to
            refresh after checking your connection.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => this.setState({ hasError: false })}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: Theme.screenBackground,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  msg: {
    fontSize: 15,
    color: Theme.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  btn: {
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  btnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 16,
    fontWeight: "600",
  },
});
