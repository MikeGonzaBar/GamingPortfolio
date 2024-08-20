import fs from "fs";
import path from "path";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

const CACHE_FILE_PATH = path.join(__dirname, "gameListXboxCache.json");

export interface Xbox {
	xuid: string;
	titles: Title[];
}

export interface Title {
	titleId: string;
	name: string;
	displayImage: string;
	devices: string[];
}

export interface Achivements {
	achievements: Achievement[];
	pagingInfo: PagingInfo;
}
export interface PagingInfo {
	continuationToken: null;
	totalRecords: number;
}

export enum ParticipationType {
	Individual = "Individual",
}
export enum OperationType {
	Sum = "SUM",
}

export enum RequirementValueType {
	Integer = "Integer",
}
export interface Requirement {
	id: string;
	current: null | string;
	target: string;
	operationType: OperationType;
	valueType: RequirementValueType;
	ruleParticipationType: ParticipationType;
}
export interface Progression {
	requirements: Requirement[];
	timeUnlocked: Date;
}
export enum AchievementType {
	Persistent = "Persistent",
}

export enum MediaAssetType {
	Icon = "Icon",
}

export interface MediaAsset {
	name: string;
	type: MediaAssetType;
	url: string;
}

export interface Achievement {
	id: string;
	serviceConfigId: string;
	name: string;
	progressState: string;
	progression: Progression;
	mediaAssets: MediaAsset[];
	description: string;
	lockedDescription: string;
	productId: string;
	achievementType: AchievementType;
	participationType: ParticipationType;
	timeWindow: null;
	estimatedTime: string;
	deeplink: string;
	isRevoked: boolean;
}

class XboxGame {
	private name: string;
	private titleId: string;
	private imageUrl: string;
	private achievements: Achievement[];
	constructor(
		name: string,
		titleId: string,
		imageUrl: string,
		achievements: Achievement[]
	) {
		this.name = name;
		this.titleId = titleId;
		this.imageUrl = imageUrl;
		this.achievements = achievements;
	}
}

class XboxHandler {
	private gameList: XboxGame[];

	constructor() {
		this.gameList = [];
	}

	private async fetchAchievements(titleId: string): Promise<Achievement[]> {
		try {
			console.log(titleId);
			const response = await axios.get(
				`https://xbl.io/api/v2/achievements/player/${process.env.XBOX_xuid}/${titleId}`,
				{
					headers: {
						"x-authorization": process.env.XBOX_API_KEY,
						accept: "*/*",
					},
				}
			);
			const data = response.data as Achivements;
			console.log(data);
			return data.achievements;
		} catch (error) {
			console.error("Error fetching achievements:", error);
			return [];
		}
	}

	public async fetchGames(): Promise<void> {
		try {
			const response = await axios.get("https://xbl.io/api/v2/achievements", {
				headers: {
					"x-authorization": process.env.XBOX_API_KEY,
					accept: "*/*",
				},
			});
			const data = response.data as Xbox;
			data.titles.forEach((title) => {
				if (
					Array.isArray(title.devices) &&
					title.devices.length === 1 &&
					title.devices[0] === "Win32"
				) {
					return;
				}
				this.fetchAchievements(title.titleId).then((achivement) => {
					console.log("Trophies for", title.name, "Fetched");
					this.addGame(
						new XboxGame(title.name, title.titleId, title.displayImage, achivement)
					);
					this.writeCache(this.gameList);
				});
			});

			return;
		} catch (error) {
			console.error("Error fetching games:", error);
			return;
		}
	}

	private addGame(game: XboxGame): void {
		this.gameList.push(game);
	}

	private writeCache(data: XboxGame[]): void {
		fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
	}

	public getGameList(): XboxGame[] {
		return this.gameList;
	}
}
const xboxHandler = new XboxHandler();

xboxHandler.fetchGames().then(() => {
	console.log(xboxHandler.getGameList());
});
