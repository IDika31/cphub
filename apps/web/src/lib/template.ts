const PLACEHOLDER_REGEX = /\{(\w+)\}/g;

export const TEMPLATES: Record<string, string> = {
  cpp17: `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
    return 0;
}`,
  cpp20: `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
    return 0;
}`,
  python3: `import sys

def solve():
    
if __name__ == "__main__":
    solve()`,
  java21: `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
            }
}`,
  nodejs: `"use strict";

function solve() {
  }

solve();`,
};

export function applyTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_REGEX, (_, name: string) => {
    return variables[name] ?? `{${name}}`;
  });
}

export function getDefaultTemplate(language: string): string {
  return TEMPLATES[language] || TEMPLATES.cpp17;
}
