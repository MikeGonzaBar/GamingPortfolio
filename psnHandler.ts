import fs from "fs";
import path from "path";
import {
	exchangeCodeForAccessToken,
	exchangeNpssoForCode,
	exchangeRefreshTokenForAuthTokens,
	getTitleTrophies,
	getUserTitles,
	getUserTrophiesEarnedForTitle,
	Trophy,
	UserThinTrophy,
} from "psn-api";
import * as dotenv from "dotenv";
dotenv.config();

const CACHE_FILE_PATH = path.join(__dirname, "gameListPSNCache.json");

interface TrophyData extends Trophy {
	earned: boolean;
	earnedDateTime?: string;
}

class PSNGame {
	private gameName: string;
	private imageUrl: string;
	private trophies: TrophyData[];
	private earnedTrophies: UserThinTrophy[];

	constructor(
		gameName: string,
		imageUrl: string,
		trophies: TrophyData[],
		earnedTrophies: UserThinTrophy[]
	) {
		this.gameName = gameName;
		this.imageUrl = imageUrl;
		this.trophies = trophies;
		this.earnedTrophies = earnedTrophies;
	}

	public getGameName(): string {
		return this.gameName;
	}

	public getImageUrl(): string {
		return this.imageUrl;
	}

	public getTrophies(): TrophyData[] {
		return this.trophies;
	}

	public getEarnedTrophies(): UserThinTrophy[] {
		return this.earnedTrophies;
	}
}

class PSNHandler {
	private gameList: PSNGame[];
	private authorization: any;

	constructor() {
		this.gameList = [];
	}

	public addGame(game: PSNGame): void {
		this.gameList.push(game);
	}

	public getGameList(): PSNGame[] {
		return this.gameList;
	}

	private async authenticate(): Promise<void> {
		const accessCode = await exchangeNpssoForCode(
			process.env.PSN_NPSSO as string
		);
		this.authorization = await exchangeCodeForAccessToken(accessCode);
		console.log("AUTH", this.authorization);

		const now = new Date();
		const expirationDate = new Date(
			now.getTime() + this.authorization.expiresIn * 1000
		).toISOString();
		const isAccessTokenExpired =
			new Date(expirationDate).getTime() < now.getTime();

		console.log("IS ACCESS TOKEN EXPIRED", isAccessTokenExpired);
		if (isAccessTokenExpired) {
			this.authorization = await exchangeRefreshTokenForAuthTokens(
				this.authorization.refreshToken
			);
			console.log("NEW AUTH", this.authorization);
		}
	}

	private readCache(): PSNGame[] | null {
		if (fs.existsSync(CACHE_FILE_PATH)) {
			const data = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
			const parsedData = JSON.parse(data);
			return parsedData.map(
				(game: any) =>
					new PSNGame(
						game.gameName,
						game.imageUrl,
						game.trophies,
						game.earnedTrophies
					)
			);
		}
		return null;
	}

	private writeCache(data: PSNGame[]): void {
		fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
	}

	private mergeTrophyLists(
		titleTrophies: Trophy[],
		earnedTrophies: Trophy[]
	): TrophyData[] {
		const earnedTrophyMap = new Map(
			earnedTrophies.map((trophy) => [trophy.trophyId, trophy])
		);
		return titleTrophies.map((trophy) => {
			const earnedTrophy = earnedTrophyMap.get(trophy.trophyId);
			return {
				...trophy,
				earned: Boolean(earnedTrophy?.earned),
				earnedDateTime: earnedTrophy ? earnedTrophy.earnedDateTime : undefined,
			};
		});
	}

	public async fetchGameList(): Promise<void> {
		await this.authenticate();

		const { trophyTitles } = await getUserTitles(this.authorization, "me");
		for (const title of trophyTitles) {
			console.log(
				`Processing title: ${title.trophyTitleName}, npCommunicationId: ${title.npCommunicationId}`
			);

			const { trophies: titleTrophies } = await getTitleTrophies(
				this.authorization,
				title.npCommunicationId,
				"all"
			);

			try {
				const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
					this.authorization,
					"me",
					title.npCommunicationId,
					"all"
				);

				if (earnedTrophies.length > 0) {
					const mergedTrophies = this.mergeTrophyLists(
						titleTrophies,
						earnedTrophies
					);
					const psnGame = new PSNGame(
						title.trophyTitleName,
						title.trophyTitleIconUrl,
						mergedTrophies,
						earnedTrophies
					);
					this.addGame(psnGame);
				}
			} catch (error) {
				console.error(error);
			}
		}

		this.writeCache(this.gameList);
	}
}

const psnHandler = new PSNHandler();

psnHandler.fetchGameList().then(() => {
	console.log(psnHandler.getGameList());
});
