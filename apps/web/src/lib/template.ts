const PLACEHOLDER_REGEX = /\{(\w+)\}/g;

export const TEMPLATES: Record<string, string> = {
  cpp20: `// @meta
// platform: {provider}
// problemid: {problemId}
// problemname: {title}
// problemgroup: {problemGroup}

#include <bits/stdc++.h>
#ifdef LOCAL
#include "./tpt/debugcp.h"
#else
#define debug(...)
#define debugarr(a, n)
#endif
using namespace std;

#define fastio                        \\
    ios_base::sync_with_stdio(false); \\
    cin.tie(NULL);                    \\
    cout.tie(NULL)

#define st string
#define ch char
#define ll long long
#define ld long double
#define ull unsigned long long

#define pll pair<ll, ll>
#define tll tuple<ll, ll, ll>
#define sll set<ll>
#define mll map<ll, ll>
#define ssll set<sll>

#define vst vector<st>
#define vld vector<ld>
#define vll vector<ll>

#define vpll vector<pll>
#define vtll vector<tll>
#define vvll vector<vll>
#define vvpll vector<vpll>
#define vpllvll vector<pair<ll, vll>>

#define fi first
#define se second
#define pb push_back

#define all(x) x.begin(), x.end()
#define rall(x) x.rbegin(), x.rend()

#define YES "YES"
#define NO "NO"

void solve(){

}

int main(){
    fastio;
    int t=1;
    // cin >> t;
    while(t--) solve();
}`,
  cpp17: `#include <bits/stdc++.h>
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
  return TEMPLATES[language] || TEMPLATES.cpp20;
}

export const DEFAULT_LANGUAGE = "cpp20";
