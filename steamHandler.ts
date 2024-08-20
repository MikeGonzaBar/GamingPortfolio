import axios from "axios";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
dotenv.config();

const CACHE_FILE_PATH = path.join(__dirname, "gameListSteamCache.json");

interface Achievement {
	name: string;
	description: string;
	image: string;
	unlocked: boolean;
	unlockTime?: number;
}
interface Game {
	appid: number;
	name: string;
	playtime_forever: number;
	img_icon_url: string;
}

interface GetOwnedGamesResponse {
	response: {
		games: Game[];
	};
}

class SteamGame {
	private gameName: string;
	private played: boolean;
	private achievements: Achievement[];
	private iconUrl: string;

	constructor(
		gameName: string,
		played: boolean,
		achievements: Achievement[],
		iconUrl: string
	) {
		this.gameName = gameName;
		this.played = played;
		this.achievements = achievements;
		this.iconUrl = iconUrl;
	}

	public getGameName(): string {
		return this.gameName;
	}

	public isPlayed(): boolean {
		return this.played;
	}

	public getAchievements(): Achievement[] {
		return this.achievements;
	}

	public getIconUrl(): string {
		return this.iconUrl;
	}
}

class SteamHandler {
	private gameList: SteamGame[];
	private apiKey: string;
	private steamId: string;

	constructor(apiKey: string, steamId: string) {
		this.gameList = [];
		this.apiKey = apiKey;
		this.steamId = steamId;
	}

	public addGame(game: SteamGame): void {
		this.gameList.push(game);
	}

	public getGameList(): SteamGame[] {
		return this.gameList;
	}

	public async fetchAchievements(appId: number): Promise<Achievement[]> {
		try {
			// Get global achievements data
			const globalAchievementsUrl = `http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/`;
			const globalResponse = await axios.get(globalAchievementsUrl, {
				params: {
					key: this.apiKey,
					appid: appId,
				},
			});

			const globalData: any = globalResponse.data;

			if (
				!globalData.game ||
				!globalData.game.availableGameStats ||
				!globalData.game.availableGameStats.achievements
			) {
				console.error("No achievements available for this game.");
				return [];
			}

			const { achievements } = globalData.game.availableGameStats;

			// Get player achievements data
			const playerAchievementsUrl = `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/`;
			const playerResponse = await axios.get(playerAchievementsUrl, {
				params: {
					key: this.apiKey,
					steamid: this.steamId,
					appid: appId,
				},
			});

			const playerData: any = playerResponse.data;

			if (!playerData.playerstats || !playerData.playerstats.achievements) {
				console.error("Error retrieving player achievements data.");
				return [];
			}

			const playerAchievements = new Map(
				playerData.playerstats.achievements.map((ach: any) => [ach.apiname, ach])
			);

			// Combine global and player achievement data
			const achievementList: Achievement[] = achievements.map(
				(achievement: any) => {
					const apiname = achievement.name;
					const playerAch: any = playerAchievements.get(apiname);

					return {
						name: achievement.displayName,
						description: achievement.description,
						image:
							playerAch && playerAch.achieved
								? achievement.icon
								: achievement.icongray,
						unlocked: !!(playerAch && playerAch.achieved),
						unlockTime: playerAch?.unlocktime,
					};
				}
			);

			return achievementList;
		} catch (error) {
			console.error("Error retrieving achievements:", error);
			return [];
		}
	}

	private readCache(): SteamGame[] | null {
		if (fs.existsSync(CACHE_FILE_PATH)) {
			const data = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
			const parsedData = JSON.parse(data);
			return parsedData.map(
				(game: any) =>
					new SteamGame(game.gameName, game.played, game.achievements, game.iconUrl)
			);
		}
		return null;
	}

	private writeCache(data: SteamGame[]): void {
		fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
	}

	public async fetchGameList(): Promise<void> {
		try {
			const response = await axios.get<GetOwnedGamesResponse>(
				"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/",
				{
					params: {
						key: this.apiKey,
						steamid: this.steamId,
						include_appinfo: true,
						include_played_free_games: true,
					},
				}
			);

			const { games } = response.data.response;
			for (const game of games) {
				if (game.playtime_forever > 0) {
					console.log(game.name);
					const achievements = await this.fetchAchievements(game.appid);
					console.log("\n");
					const iconUrl = `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`;
					const steamGame = new SteamGame(game.name, true, achievements, iconUrl);
					this.addGame(steamGame);
				}
			}
			this.writeCache(this.gameList);
		} catch (error) {
			console.error("Error fetching game list:");
		}
	}
}

const apiKey = process.env.STEAM_API_KEY as string;
const steamId = process.env.STEAM_ID as string;
const steamHandler = new SteamHandler(apiKey, steamId);

steamHandler.fetchGameList().then(() => {
	console.log(steamHandler.getGameList());
});
