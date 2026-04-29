#!/usr/bin/env bash
# Claude Code status line script
# Fields: model.display_name, workspace.current_dir, rate_limits.five_hour.used_percentage,
#         context_window.used_percentage, transcript_path

input=$(cat)

# --- Extract fields ---
model=$(echo "$input" | jq -r '.model.display_name // "unknown model"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
transcript=$(echo "$input" | jq -r '.transcript_path // ""')
ctx_used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five_hour_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_hour_resets_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')

# --- ANSI color helpers (vivid, high-contrast for dark backgrounds) ---
RESET=$'\033[0m'
BOLD=$'\033[1m'
BRIGHT_CYAN=$'\033[1;96m'
BRIGHT_WHITE=$'\033[1;97m'
BRIGHT_YELLOW=$'\033[1;93m'
BRIGHT_BLUE=$'\033[1;94m'
BOLD_GREEN=$'\033[1;32m'
BOLD_YELLOW=$'\033[1;33m'
BOLD_RED=$'\033[1;31m'
SEP=$'\033[0;37m'

# --- Directory: shorten home prefix to ~ ---
short_dir="$current_dir"
home_dir="$HOME"
if [ -n "$home_dir" ]; then
    short_dir="${current_dir/#$home_dir/~}"
fi

# --- Cache: git branch (cached per directory, TTL 10s) ---
dir_hash=$(echo "$current_dir" | md5)
cache_file="/tmp/.claude_statusline_git_${dir_hash}"
remote_cache_file="/tmp/.claude_statusline_remote_${dir_hash}"
status_cache_file="/tmp/.claude_statusline_status_${dir_hash}"
git_branch=""
github_url=""
now=$(date +%s)
if [ -f "$cache_file" ]; then
    cache_mtime=$(stat -f "%m" "$cache_file" 2>/dev/null || echo 0)
    cache_age=$((now - cache_mtime))
    if [ "$cache_age" -lt 10 ]; then
        git_branch=$(cat "$cache_file")
    fi
fi
if [ -z "$git_branch" ] && [ -n "$current_dir" ] && [ -d "$current_dir/.git" ]; then
    git_branch=$(git -C "$current_dir" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || echo "")
    echo "$git_branch" > "$cache_file"
fi

# --- Cache: git status (cached per directory, TTL 5s) ---
# Format stored: "staged:N unstaged:N untracked:N"
git_staged=0
git_unstaged=0
git_untracked=0
if [ -n "$git_branch" ]; then
    status_fresh=0
    if [ -f "$status_cache_file" ]; then
        status_mtime=$(stat -f "%m" "$status_cache_file" 2>/dev/null || echo 0)
        status_age=$((now - status_mtime))
        if [ "$status_age" -lt 5 ]; then
            status_fresh=1
            status_line=$(cat "$status_cache_file")
            git_staged=$(echo "$status_line" | sed 's/.*staged:\([0-9]*\).*/\1/')
            git_unstaged=$(echo "$status_line" | sed 's/.*unstaged:\([0-9]*\).*/\1/')
            git_untracked=$(echo "$status_line" | sed 's/.*untracked:\([0-9]*\).*/\1/')
        fi
    fi
    if [ "$status_fresh" -eq 0 ] && [ -n "$current_dir" ] && [ -d "$current_dir/.git" ]; then
        porcelain=$(git -C "$current_dir" --no-optional-locks status --porcelain 2>/dev/null || echo "")
        git_staged=$(echo "$porcelain" | grep -v '^??' | grep -v '^!!' | awk 'substr($0,1,1) ~ /[MADRCU]/' | wc -l | tr -d ' ')
        git_unstaged=$(echo "$porcelain" | grep -v '^??' | grep -v '^!!' | awk 'substr($0,2,1) ~ /[MD]/' | wc -l | tr -d ' ')
        git_untracked=$(echo "$porcelain" | grep '^??' | wc -l | tr -d ' ')
        echo "staged:${git_staged} unstaged:${git_unstaged} untracked:${git_untracked}" > "$status_cache_file"
    fi
fi

# --- Cache: remote URL (cached per directory, TTL 60s) ---
if [ -n "$git_branch" ]; then
    if [ -f "$remote_cache_file" ]; then
        remote_mtime=$(stat -f "%m" "$remote_cache_file" 2>/dev/null || echo 0)
        remote_age=$((now - remote_mtime))
        if [ "$remote_age" -lt 60 ]; then
            github_url=$(cat "$remote_cache_file")
        fi
    fi
    if [ -z "$github_url" ] && [ -n "$current_dir" ] && [ -d "$current_dir/.git" ]; then
        raw_remote=$(git -C "$current_dir" --no-optional-locks remote get-url origin 2>/dev/null || echo "")
        if [ -n "$raw_remote" ]; then
            # Convert SSH (git@github.com:owner/repo.git) to HTTPS
            if echo "$raw_remote" | grep -q '^git@github\.com:'; then
                github_url=$(echo "$raw_remote" | sed 's|^git@github\.com:|https://github.com/|; s|\.git$||')
            # Pass through HTTPS GitHub URLs, strip .git suffix
            elif echo "$raw_remote" | grep -q '^https://github\.com/'; then
                github_url=$(echo "$raw_remote" | sed 's|\.git$||')
            fi
        fi
        echo "$github_url" > "$remote_cache_file"
    fi
fi

# --- Context window bar (10 segments) ---
ctx_bar=""
if [ -n "$ctx_used" ]; then
    filled=$(printf "%.0f" "$(echo "$ctx_used / 10" | bc -l 2>/dev/null || echo 0)")
    empty=$((10 - filled))
    bar=""
    i=0
    while [ $i -lt $filled ]; do bar="${bar}#"; i=$((i+1)); done
    i=0
    while [ $i -lt $empty ]; do bar="${bar}-"; i=$((i+1)); done
    ctx_int=$(printf "%.0f" "$ctx_used")
    if [ "$ctx_int" -ge 80 ]; then
        ctx_color="$BOLD_RED"
    elif [ "$ctx_int" -ge 50 ]; then
        ctx_color="$BOLD_YELLOW"
    else
        ctx_color="$BOLD_GREEN"
    fi
    ctx_bar="[${bar}] ${ctx_int}%%"
fi

# --- Rate limit display ---
rate_str=""
rate_label="5h"
if [ -n "$five_hour_pct" ]; then
    rate_int=$(printf "%.0f" "$five_hour_pct")
    if [ "$rate_int" -ge 80 ]; then
        rate_color="$BOLD_RED"
    elif [ "$rate_int" -ge 50 ]; then
        rate_color="$BOLD_YELLOW"
    else
        rate_color="$BOLD_GREEN"
    fi
    rate_str="${rate_int}%%"
    if [ -n "$five_hour_resets_at" ]; then
        reset_hour=$(date -r "$five_hour_resets_at" +"%Hh" 2>/dev/null || date -d "@${five_hour_resets_at}" +"%Hh" 2>/dev/null || echo "")
        if [ -n "$reset_hour" ]; then
            rate_label="${reset_hour},"
        fi
    fi
fi

# --- Transcript: plain bold filename ---
transcript_name=""
if [ -n "$transcript" ]; then
    transcript_name=$(basename "$transcript")
fi

# --- Assemble output (two lines) ---

# Line 1: model | directory [git branch]
printf "${BRIGHT_CYAN}${model}${RESET}"
printf " ${SEP}|${RESET} "
printf "${BRIGHT_WHITE}${short_dir}${RESET}"
if [ -n "$git_branch" ]; then
    # Build git status indicator string
    # Clean = all zeros; color branch green. Any dirty = yellow/red with counts.
    BRIGHT_GREEN=$'\033[1;32m'
    git_indicator=""
    if [ "$git_staged" -eq 0 ] && [ "$git_unstaged" -eq 0 ] && [ "$git_untracked" -eq 0 ]; then
        branch_color="$BOLD_GREEN"
        git_indicator=" ${BOLD_GREEN}*${RESET}"
    else
        branch_color="$BRIGHT_YELLOW"
        git_indicator=""
        if [ "$git_staged" -gt 0 ]; then
            git_indicator="${git_indicator} ${BOLD_GREEN}+${git_staged}${RESET}"
        fi
        if [ "$git_unstaged" -gt 0 ]; then
            git_indicator="${git_indicator} ${BOLD_RED}!${git_unstaged}${RESET}"
        fi
        if [ "$git_untracked" -gt 0 ]; then
            git_indicator="${git_indicator} ${SEP}?${git_untracked}${RESET}"
        fi
    fi
    if [ -n "$github_url" ]; then
        branch_link="${github_url}/tree/${git_branch}"
        OSC=$'\033]'
        ST=$'\033\\'
        printf " ${branch_color}${OSC}8;;${branch_link}${ST}(${git_branch})${OSC}8;;${ST}${RESET}${git_indicator}"
    else
        printf " ${branch_color}(${git_branch})${RESET}${git_indicator}"
    fi
fi
printf "\n"

# Line 2: ctx bar | rate limit | transcript link
if [ -n "$ctx_bar" ]; then
    printf "${BRIGHT_WHITE}ctx ${ctx_color}${ctx_bar}${RESET}"
fi
if [ -n "$rate_str" ]; then
    if [ -n "$ctx_bar" ]; then printf " ${SEP}|${RESET} "; fi
    printf "${BRIGHT_WHITE}${rate_label} ${rate_color}${rate_str}${RESET}"
fi
if [ -n "$transcript_name" ]; then
    if [ -n "$ctx_bar" ] || [ -n "$rate_str" ]; then printf " ${SEP}|${RESET} "; fi
    printf "${BOLD}${transcript_name}${RESET}"
fi
printf "\n"
