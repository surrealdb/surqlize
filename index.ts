import Surreal, { RecordId } from "surrealdb";
import {
	__display,
	__type,
	createDisplayUtils,
	edge,
	orm,
	t,
	table,
} from "./src";

const user = table("user", {
	name: t.object({
		first: t.string(),
		last: t.string(),
	}),
	age: t.number(),
	email: t.string(),
	created: t.date(),
	updated: t.date(),
	metadata: t.object({
		bio: t.string(),
		avatar: t.string(),
		eq: t.object({
			value: t.literal(true),
		}),
	}),
	props: t.array([t.string(), t.number(), t.bool()]),
	tags: t.array(t.string()),
	opt: t.option(t.string()),
});

const db = orm(new Surreal(), user);

const utils = createDisplayUtils();
const usersQuery = db.select("user").return((user) => ({
	name: user.name.first.join(" ", user.name.last),
	email: user.email,
}));

type a = t.infer<typeof usersQuery>;

console.log(usersQuery[__display](utils));
console.log(utils.variables);
